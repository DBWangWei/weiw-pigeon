#import "shared/style.typ": *

#show: deck
#let branded-s = s.with(logo: "../assets/HKUST-GZ.png")
#let vfill() = v(1fr)
#let hfill() = h(1fr)
#set document(
  title: "From AI Tutors to A New Pedagogy for Learning in the AI-era",
  author: "Wei Wang · The Hong Kong University of Science and Technology (Guangzhou)",
)

// Main talk: approximately 20 minutes. Labels distinguish scenarios, observations,
// proposals, and evidence so that ambitious claims are not presented as findings.

#slide[
  #metadata((id: "01", title: "From AI Tutors to A New Pedagogy for Learning in the AI-era", section: "AI + education", source: [Invited talk · /*CUHK-Shenzhen AI-enabled Teaching Workshop · 16*/ October 2026])) <slide-record>
  #block(width: 100%, height: 100%, fill: navy-pale, radius: 12pt, inset: 28pt)[
    #align(center + horizon)[
      #text(size: 13pt, weight: "bold", tracking: 1.2pt, fill: teal)[AI + EDUCATION /*· CUHK-SHENZHEN WORKSHOP*/]
      #v(22pt)
      #block(width: 100%, fill: teal, radius: 8pt, inset: (x: 30pt, y: 27pt))[
        #text(size: 35pt, weight: "bold", fill: rgb("FFFFFF"))[From AI Tutors to A New Pedagogy for Learning in the AI-era]
      ]
      #v(22pt)
      #text(size: 21pt, weight: "bold", fill: violet)[What should universities teach when expert, adaptive explanations are available to every student?]
      #v(24pt)
      #line(length: 62%, stroke: 1.2pt + violet)
      #v(18pt)
      #grid(columns: (1fr, 1fr), gutter: 20pt, align: bottom,
        [#text(size: 16pt, fill: ink)[Wei Wang 
        
        DSA · INFH

        The Hong Kong University of Science and Technology (Guangzhou)]],
        [#align(right)[#text(size: 16pt, fill: ink)[October 2026]]],
      )
      #v(12pt)
      #grid(columns: (1fr, auto), gutter: 14pt, align: bottom,
        [#text(size: 10.5pt, fill: muted)[/*Invited talk · CUHK-Shenzhen AI-enabled Teaching Workshop*/]],
        [#image("assets/HKUST-GZ.png", height: 24pt)],
      )
    ]
  ]
]

#branded-s("02", [Students are already using AI to study], section: "1 · Why change", source: [Lumina–Gallup 2026: 57% of surveyed U.S. college students use AI for coursework at least weekly; Bastani et al., PNAS 2025])[
  #set text(size: 17.5pt)
  #set par(leading: 0.42em, spacing: 0.42em)
  #grid(columns: (1fr, 1.12fr), gutter: 24pt, align: top,
    [
      #text(size: 38pt, weight: "bold", fill: teal)[57%]
      #v(3pt)
      #text(size: 18pt)[of surveyed U.S. college students use AI for coursework at least weekly.]
      #v(16pt)
      #text(size: 19pt, weight: "bold", fill: violet)[Available anytime and (way too) powerful]
      #v(5pt)
      #text(size: 17pt)[e.g., subtlties, and #link("./demo/IPF/index.html")[multi-modal]]

      #v(13pt)
      #takeaway[Common phenomena: (1) attendence rate even lower (2) no one asks questions]
    ],
    [
      #image("input/PAC-learning.png", width: 100%, height: 350pt, fit: "contain")
    ],
  )
  
]

#branded-s("03a", [A powerful AI does not necessarily help learning], section: "1 · Why change", source: [Bastani et al. (2025); Kosmyna et al. (2025); Stadler et al. (2024); Tao, Mathematics in the Age of AI (2026)])[
  #set text(size: 17pt)
  #set par(leading: 0.4em, spacing: 0.4em)
  #grid(columns: (1.35fr, 1fr), gutter: 20pt, align: top,
    [
      #text(size: 19pt)[Multiple studies showed that learning #text(fill: teal, weight: "bold")[with] access to AI may lead to worse independent test performance (i.e., #text(fill: teal, weight: "bold")[without AI]).]
      #v(9pt)
      #set list(spacing: 5pt)
      - Bastani #emph[et al.], “Generative AI without guardrails can harm learning: Evidence from high school mathematics.” PNAS, 2025
      - Kosmyna #emph[et al.], “Your Brain on ChatGPT: Accumulation of Cognitive Debt when Using an AI Assistant for Essay Writing Task.” arXiv preprint 2506.08872
      - Stadler #emph[et al.], “Cognitive ease at a cost: LLMs reduce mental effort but compromise depth in student scientific inquiry.” Computers in Human Behavior, 2024.
    ],
    [
      #image("input/question-depth.png", width: 100%, height: 240pt, fit: "contain")
      #v(8pt)
      #text(size: 15.5pt, fill: muted)[Question depth varies across courses, and surface fluency can hide shallow learning.]
    ],
  )
]

#branded-s("03b", [Why assisted learning can miss the learning goal], section: "1 · Why change", source: [TDAA question-depth coding; curriculum interpretation])[
  #set text(size: 18pt)
  #set par(leading: 0.42em, spacing: 0.42em)
  #card([Most observed questions are surface questions], [Translation, explanation, summarize/quick-learn, and answer-course-test-question requests dominate the observed interactions.], color: amber, fill: amber-pale)
  #v(18pt)
  #text(size: 23pt, weight: "bold", fill: teal)[Possible explanations]
  #v(10pt)
  #grid(columns: (1fr, 1fr), gutter: 20pt, align: top,
    card([1 · Incorrect use of AI], [Lack of *active retrieval* and *productive struggle*.], color: teal, fill: pale),
    card([2 · Partial assessments], [Current assessments cannot fully assess capabilities developed by AI-assisted learning, such as system thinking and dealing with complexities.], color: violet, fill: violet-pale),
  )
]

#branded-s("04", [Exploration teaches what an answer cannot], section: "1 · Why change", source: [])[
  #image("input/exploring-vs-answering.png", width: 100%, height: 302pt, fit: "contain")
  #v(3pt)
  #small[Similar to #link("https://mathstodon.xyz/@tao/117395269325940185")[Tao's argument between Math 1.0 and 2.0]]
]

#branded-s("05", [TDAA: Learning and exploring in class], section: "2 · TDAA", source: [Spring 2026 Theory of Computation course; TDAA = Test-Driven, AI-Assisted])[
  #fig("../assets/tda-cycle-v3.svg", width: 96%, height: 210pt)
  #v(13pt)
  - *(1) Self-paced learning*: cater for different types/learning-styles of students
  - *(1+2) AI, instructors, and classmates*: offer a learning community, feedback, alternative views, emotional support, and guided exploration, where solitary study *rarely* provides.
  - *(3) Internalization*: coerced by the test
]

#branded-s("06", [The test anchors mastery without limiting exploration], section: "2 · TDAA", source: [TDAA v1 course design; FCES 2026 deck])[
  + *Reduce procrastination.* Key for courses that have deep dependency. 
  + *Reward internalization.* Sense of achievement. 
  + *Test core understanding.* Questions target the average expected level; exploration is not examined.
  + *Leave room to explore.* 120/130 points on paper, but capped at 100.
]

#branded-s("07", [AI-generated materials and AI platform], section: "2 · TDAA", source: [Course platform screenshot: input/AI-platform-1.png; anonymized example])[
  #set text(size: 18pt)
  #set par(leading: 0.4em, spacing: 0.45em)
  #grid(columns: (1fr, 2.1fr), gutter: 18pt, align: top,
    [
      *Materials*

      - Prose guided by questions, examples, and applications
      - A pedagogy playground: three tiers, scaffolding, and alternative materials

      *AI platform*

      - Personal highlighting and notes
      - Instructor “to read / to answer” tasks
      - Contextual questions and answers
    ],
    [#image("input/AI-platform-1.png", width: 100%, height: 300pt, fit: "contain")],
  )
]

#branded-s("08", [The importance of the instructor], section: "2 · TDAA", source: [TDAA instructor role; course-design interpretation])[
  #set text(size: 18pt)
  #set par(leading: 0.4em, spacing: 0.45em)
  #grid(columns: (1fr, 1.45fr), gutter: 24pt, align: top,
    [
      #text(size: 22pt, weight: "bold", fill: teal)[Offline]
      #v(6pt)
      + *Architect the learning*
      + *Generate learning materials*
      + *Prepare and collect good questions*
    ],
    [
      #text(size: 22pt, weight: "bold", fill: violet)[Online]
      #v(6pt)
      + *Support the learner mentally.* Notice frustration, restore confidence, and sustain motivation.
      + *Guide learning and exploration.* Check understanding, give suggestions, answer and solicit questions.
      + *Read the room.* Decide when to intervene with a mini-lecture, discussion, or student sharing.
    ],
  )
  #vfill()
  #takeaway[
    The instructor is the composer and conductor; let the class #mark[be water].
  ]
]

#branded-s("08b", [The importance of the instructor], section: "2 · TDAA", source: [Adapted from Principal Rui BAO])[
  #set text(size: 20pt)
  #set par(leading: 0.45em, spacing: 0.45em)
  #v(10pt)
  #text(size: 24pt, weight: "bold", fill: teal)[Why will a student want to learn something _hard_?]
  #v(18pt)
  #set enum(spacing: 14pt)
  1. *Love the teacher* (their passion for knowledge) 
  2. *Has an interest* in the course content
  3. *Has a need* that the course can (partially) fulfill
  4. *Has a plan/dream*
  #vfill()
  #takeaway[The instructor is the key — they can influence all four fundamental motivations.]
]

#branded-s("09", [On exploration: teaching takes more preparation], section: "2 · TDAA", source: [Illustrative proof paths for uniqueness of reduced row echelon form; questions from learning and exploration])[
  #set text(size: 19pt)
  #set par(leading: 0.4em, spacing: 0.45em)
  #set list(spacing: 9pt)
  #set enum(spacing: 9pt)
  AI or AI-assisted students can raise questions *beyond the textbook*. Instructors need *full-stack knowledge, preparation, and on-the-fly learning* with AI.
  #v(8pt)
  #grid(columns: (1fr, 1fr), gutter: 26pt, align: top,
    [#card([Diverse perspective/routes], [
      Proof of RREF's uniqueness:
      1. Construct the canonical form from the row space (textbook).
      2. Assume two different reduced forms; derive a contradiction (student).
      3. Use a dual-basis perspective (AI under prompting).
    ], color: violet, fill: violet-pale)],
    [#card([Great questions], [
      - Why does the Halting Problem proof not apply to the halting problem for DFAs?
      - A probability space has disjoint outcomes. How should we model people's menu choices?
      - When extending a finite-class PAC bound to an infinite class, can the growth function $Pi(cal(F))$ replace $cal(H)$, rather than using Rademacher complexities?
    ], color: violet, fill: violet-pale)],
  )
  #vfill()
  #takeaway[An underprepared or passive instructor may reasonably appear less helpful than AI.]
]

#branded-s("10", [Version 1 feedback points to a broader Version 2], section: "2 · TDAA", source: [DSAA3073: Theory of Computation survey; Version 2 courses listed on slide])[
  #set text(size: 17pt)
  #set par(leading: 0.4em, spacing: 0.42em)
  #set list(spacing: 6pt)

  #card(
    [TDAA VERSION 1 · SURVEY RESULTS
      #text(size: 14pt, weight: "regular", fill: muted)[DSAA3073 · Theory of Computation]],
    [
      #text(size: 23pt, weight: "bold", fill: teal)[10 of 18] respondents reported learning both deeper and faster.
      #v(4pt)
      #text(size: 16pt)[Six reported deeper but slower learning; two reported similar or worse. These are student perceptions.]
    ],
    color: teal,
    fill: pale,
  )

  #v(10pt)

  #card(
    [TDAA VERSION 2 · TESTING DIFFERENT IDEAS],
    [
      #grid(columns: (1fr, 1.15fr), gutter: 18pt, align: top,
        [
          *Design changes*
          - Adapt to different cohorts of students & course content
          - Fewer tests; more time for depth
          - More in-class learning activities
          - Ask students to generate: questions, discussion, mind maps
          - Test alternative pedagogies for generated materials
          - Trace finer-grained learning activities
        ],
        [
          *Courses represented*
          - DSAA1001: Introduction of Data Science and Analytics
          - DSAA3073: Theories in Data Science
          - UFUG1601: Introduction to Computer Science
          - UFUG2103: Linear Algebra
        ],
      )
    ],
    color: violet,
    fill: violet-pale,
  )
]

/*
#branded-s("12", [Teach the same idea at three depths], section: "3 · Three theses", source: [Curriculum proposal; linear algebra examples are illustrative])[
  #grid(columns: (1fr, 1fr, 1fr), gutter: 16pt,
    [#text(fill: teal, weight: "bold")[First pass: use it]

    Learn eigenvectors and diagonalization as presented; solve familiar exercises.],
    [#text(fill: violet, weight: "bold")[Second pass: question it]

    Why does diagonalization need an eigenbasis? When does it fail? Solve a linear system in that basis.],
    [#text(fill: amber, weight: "bold")[Third pass: transfer it]

    Choose and combine the ideas to handle a new system or application.],
  )
  #v(18pt)
  #takeaway[Critical thinking and consolidation need a scheduled second pass, not only more first-pass coverage.]
]
*/
#branded-s("11", [Hone higher-order skills], section: "3 · Three theses", source: [Curriculum proposal; linear algebra examples are illustrative])[
  #set text(size: 17.5pt)
  #set par(leading: 0.4em, spacing: 0.42em)
  #grid(columns: (1.45fr, 1fr), gutter: 22pt, align: top,
    [#image("input/UTM-halting.pdf", width: 100%, height: 230pt, fit: "contain")],
    [
      #text(size: 20pt)[Take *critical thinking* as an example:]
      #v(6pt)
      #set enum(spacing: 7pt)
      1. AI-generated sufficient number of effective training examples when learning the knowledge 
      2. Transfer to human or AI generated contents
    ],
  )
  #v(8pt)
  #takeaway[Knowledge is cheap; hone the skills$==>$ select content to teach]
]


#branded-s("12", [DFS-style Learning], section: "3 · Three theses", source: [Illustrative first-principles curriculum path; increase in abstraction levels])[
  #set text(size: 18pt)
  #set par(leading: 0.42em, spacing: 0.45em)
  #hook[Bound the probability of some rare event (typically $|X - bb(E)[X]|$)]
  #v(8pt)
  #grid(columns: (1fr, 1fr), gutter: 14pt,
    card([1 · CLT], [Asymptotic bound], color: teal, fill: pale),
    card([2 · Tail inequalities], [Markov, Chebyshev, Hoeffding], color: violet, fill: violet-pale),
    card([3 · Extend the proof technique], [(Upper) bound $p(x) ==> $ optimization problem], color: amber, fill: amber-pale),
    card([4 · Experiment], [(Numerically) find the worst-case for a tight bound], color: coral, fill: coral-pale),
  )
  #v(8pt)
  #text(size: 16.5pt)[*Deeper:* D. Bertsimas, I. Popescu. "_Optimal Inequalities in Probability Theory: A Convex Optimization Approach_.", SIAM Journal on Optimization, 2005.]
  #v(8pt)
  #takeaway[This is depth-first learning, or *mini-research* (enabled by AI): solve a real question, learn the needed tools, explore in depth and make associations; periodically patch and consolidate.]
]

#branded-s("13", [Extremely personalized learning], section: "3 · Three theses", source: [Personalized learning as a reinforcement-learning-style control loop])[
  #set text(size: 17.5pt)
  #set par(leading: 0.4em, spacing: 0.42em)
  #grid(columns: (1.15fr, 1fr), gutter: 20pt, align: top,
    [#fig("../assets/personalization.svg", width: 100%, height: 185pt)],
    [
      #text(size: 21pt, weight: "bold", fill: teal)[Reinforcement-learning-style learning]
      #v(5pt)
      - *State:* reasoning, effort, and response.
      - *Trace:* attempts, wrong steps, rereading, questions, and feedback responses.
      - *Next action:* material, exercise, depth, and timing based on current evidence.
      - *Reward:* based on the trace, next action, and state; combine progress, AI feedback, and curiosity.
    ],
  )
  #v(8pt)
  #takeaway[The current learning system is inefficient; choose a locally optimal policy to improve learning efficiency significantly.]
]

#branded-s("14", [Conclusions], section: "4 · Invitation", source: [Design agenda; TDAA is a course experiment, not a verified system-wide gain])[
  #text(size: 25pt, weight: "bold", fill: teal)[AI changes both how students learn and what they need to learn.]
  #v(18pt)
  *Scientific research into AI + education*
  - Exploit AI's capabilities, while keeping the learner's reasoning visible.
  - Understand and model how people learn, struggle, and transfer.
  - Use technical and scientific methods: build, compare, measure, falsify.
  - Develop and iterate quickly as the models change.
  #v(12pt)
  #takeaway[Call for motivated instructors to join us to try out new ideas in real courses.]
]


/*
// Blank page separates the delivered talk from backup material.
#slide[#box(width: 1pt, height: 1pt, fill: white)]

#branded-s("A1", [Missing pieces], section: "Appendix", source: [])[
  Psychological issues:  
  - Students have their agenda and issues

  Assessments:
  - Severely outdated and inadequate

  Stability: 
  - Power of AI improves very fast  
]

#branded-s("A2", [Desirable Capabilities], section: "Appendix", source: [])[
  What are the key capabilities we want the student to master? 
  - Dealing with complexity
    - Use/device abstractions, and able to move up/down the abstraction level freely (without lossing the subtlties)
    - System thinking
  - Meta-cognition
    - Adaptivity: 
      + learn new knowledge/skills quickly
      + working with evolving AI effectively (Model-predictive control?)
    - Reflect and self-evolve
  - Psychological power
    - confidence
    - creativity, taste
    - perseverence, attention, motivation
]


// Appendix
#branded-s("A1", [Mathematical research is becoming an engineering workflow], section: "Appendix", source: [OpenAI math README (372 result families, varying verification); OpenAI Navier–Stokes report (2026); Tao, Mathematics in the Age of AI])[
  #text(size: 22pt, weight: "bold", fill: teal)[Exercises -> AMC -> Olympiad -> research problems]
  #v(20pt)
  #grid(columns: (1fr, 1fr), gutter: 22pt, align: top,
    [*Search at scale:* OpenAI released 372 families of mathematical results across 719 manuscripts. Not every result is formalized or independently checked.],
    [*Proof and verification:* OpenAI reported a Lean-formalized Navier–Stokes blowup result with smooth forcing; mathematical review and acceptance are separate steps.],
  )
  #v(19pt)
  #takeaway[Tao's question for training: if AI can produce a correct solution, what must a mathematician still understand, explain, and judge?]
]



#branded-s("A3", [What the current evidence can and cannot show], section: "Appendix", source: [Local review: output/critical-thinking-stem-ai-research-2026.md])[
  #table(columns: (1.35fr, 1.8fr, 1.8fr),
    [Question], [Can support], [Cannot establish],
    [Can AI create opportunities for reasoning?], [Constrained critique, counterexamples, verification, revision], [Generic chatbot access improves critical thinking],
    [Did students learn?], [Observed products, reasoning traces, self-reports], [Immediate assisted performance equals unaided capability],
    [Does the method transfer?], [Changed-format and delayed no-resource tasks], [Dialogue length or prompt count is a learning measure],
  )
  #v(15pt)
  #risk[The most defensible claim is conditional: AI can support critical-thinking opportunities when students attempt first, receive constrained challenge, verify outputs, revise, and later transfer unaided.]
]

#branded-s("A4", [Five failure modes to test, not hide], section: "Appendix", source: [Plan2.md: limitations, objections, and mitigations])[
  #table(columns: (1.05fr, 2.25fr),
    [Failure mode], [Mitigation to test],
    [Stress and gaming], [Reduce frequency and stakes; retain an unaided mastery check; inspect workload and disengagement.],
    [Novice abandonment], [Structured materials, stuckness signals, support escalation, accessible non-chat alternatives.],
    [AI over-trust], [Reasoning-first prompts, source-grounded materials, proof/experiment/peer verification, offline transfer.],
    [Breadth gaps], [Prerequisite spine, bridge assessments, heterogeneous teams, rotating problems.],
    [Data harm], [Consent, minimal traces, retention/access policy, comparable non-AI path, contestable inferences.],
  )
]

#branded-s("A5", [A measurement protocol for the next iteration], section: "Appendix", source: [Proposed evaluation design])[
  #grid(columns: (1fr, 1fr), gutter: 18pt,
    card([Outcomes], [Unaided concept mastery; changed-format transfer; quality of explanations and choices; retention after delay; equity across preparation levels], color: teal, fill: pale),
    card([Process and cost], [Assisted vs unassisted work; verification behavior; instructor and TA time; student pressure and agency; AI error and correction rates], color: violet, fill: violet-pale),
  )
  #v(19pt)
  #hook[The question is not “did students use AI?” It is “what capability changed, under what constraint, at what cost?”]
]

#branded-s("A6", [A practical invitation], section: "Appendix", source: [Closing prompt for discussion])[
  #text(size: 29pt, weight: "bold", fill: teal)[Bring one course.]
  #v(8pt)
  #text(size: 29pt, weight: "bold", fill: violet)[State one hypothesis.]
  #v(8pt)
  #text(size: 29pt, weight: "bold", fill: amber)[Measure one capability.]
  #v(20pt)
  #quote[Then build a small, cross-disciplinary experiment that can fail informatively and improve before the next model upgrade changes the baseline again.]
  #v(22pt)
  #small[Discussion: Which part of your course should remain human even when explanation is abundant?]
]
*/