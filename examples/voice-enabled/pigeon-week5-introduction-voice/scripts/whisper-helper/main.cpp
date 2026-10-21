// Persistent PCM16 -> text bridge. No microphone capture or recording files.
#include "whisper.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

static std::string quoted(const std::string & text) {
    std::string result = "\"";
    const char hex[] = "0123456789abcdef";
    for (unsigned char c : text) {
        if (c == '"' || c == '\\') { result += '\\'; result += c; }
        else if (c < 32) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += c;
    }
    return result + '"';
}

int main(int argc, char **argv) {
    if (argc != 4) return 2;
    auto context_params = whisper_context_default_params();
    context_params.use_gpu = false;
    auto *context = whisper_init_from_file_with_params(argv[1], context_params);
    if (!context) { std::cout << "{\"error\":\"Could not load local Whisper model\"}" << std::endl; return 3; }
    const std::string language = argv[2];
    if (whisper_lang_id(language.c_str()) < 0 || (!whisper_is_multilingual(context) && language != "en")) {
        std::cout << "{\"error\":\"Model does not support configured language; base.en requires en\"}" << std::endl;
        whisper_free(context); return 4;
    }
    auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = std::max(1, std::min(16, std::stoi(argv[3])));
    params.language = language.c_str();
    params.translate = false;
    params.no_context = true;
    params.no_timestamps = true;
    params.print_realtime = params.print_progress = params.print_timestamps = params.print_special = false;
    params.suppress_nst = true;
    std::cout << "{\"ready\":true}" << std::endl;
    unsigned char header[4];
    while (std::cin.read(reinterpret_cast<char *>(header), 4)) {
        uint32_t count = uint32_t(header[0]) | uint32_t(header[1]) << 8 | uint32_t(header[2]) << 16 | uint32_t(header[3]) << 24;
        if (count < 4000 || count > 192000) break;
        std::vector<unsigned char> pcm(count * 2);
        if (!std::cin.read(reinterpret_cast<char *>(pcm.data()), pcm.size())) break;
        std::vector<float> audio(count);
        double energy = 0;
        for (uint32_t i = 0; i < count; ++i) {
            const int16_t sample = static_cast<int16_t>(uint16_t(pcm[2*i]) | uint16_t(pcm[2*i+1]) << 8);
            audio[i] = sample / 32768.0f;
            energy += audio[i] * audio[i];
        }
        std::string text;
        // Avoid hallucinated phrases on silence, including direct API requests.
        if (std::sqrt(energy / count) > .001) {
            if (whisper_full(context, params, audio.data(), static_cast<int>(count)) != 0) {
                std::cout << "{\"error\":\"Local Whisper decoding failed\"}" << std::endl; break;
            }
            for (int i=0; i < whisper_full_n_segments(context); ++i)
                text += whisper_full_get_segment_text(context, i);
        }
        std::cout << "{\"text\":" << quoted(text) << "}" << std::endl;
    }
    whisper_free(context);
}
