"""Behavioral checks for offline, source-grounded message extraction."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from extract_graph import build_local, validate


def slide(number, title, body='', **extra):
    return dict(id=str(number), page=number, title=title, text=title+'\n'+body,
                section='Learning', width=720, height=405, **extra)


def manifest(slides):
    return dict(deckId='test', revision='revision', slides=slides)


class GraphTests(unittest.TestCase):
    def graph(self, slides):
        source = manifest(slides)
        before = copy.deepcopy(source)
        graph = build_local(source)
        validate(graph, source)
        self.assertEqual(source, before)
        self.assertEqual(graph, build_local(source))
        return graph

    def test_authored_messages_win_over_repeated_chrome_and_terms(self):
        claim = 'More observations reduce sampling variation; systematic measurement bias can remain.'
        rows = [slide(1, 'Sample size', 'Repeated university footer\n'+claim+'\nvariance variance variance',
                      semanticTiers=dict(roles=[dict(role='takeaway', text=claim, id='bias')]))]
        rows += [slide(i, 'Background '+str(i), 'Repeated university footer\nA distinct explanation of estimator stability.') for i in range(2, 6)]
        graph = self.graph(rows)
        main = [n for n in graph['concepts'] if n['type']=='message' and any(m['slideId']=='1' for m in n['mentions'])]
        self.assertEqual([n['label'] for n in main], [claim])
        self.assertFalse(any('footer' in n['label'] for n in graph['concepts']))
        self.assertFalse(any(n['type']=='slide' for n in graph['concepts']))

    def test_source_takeaway_is_selected_even_if_unique(self):
        claim = 'Regularization trades squared bias for lower variance.'
        graph = self.graph([slide(1, 'Estimation', 'Generic introductory text.\n'+claim,
                                  keyMessages=[dict(text=claim)]), slide(2, 'Other', 'An unrelated conclusion about geometry.')])
        node = next(n for n in graph['concepts'] if n['label']==claim)
        self.assertEqual(node['selection']['origin'], 'typst-takeaway')

    def test_support_and_deep_links_preserve_authored_direction(self):
        claim, support, derivation = 'Stability depends on the observations.', 'The figure compares noisy observations with a stable estimate.', 'The variance decomposition explains estimator stability.'
        rows = [slide(1, 'Stability', claim+'\n'+support, semanticTiers=dict(roles=[
            dict(role='takeaway', text=claim, id='stability'), dict(role='support', text=support, to='stability')],
            deep=[dict(to='stability', slideId='2')])), slide(2, 'Derivation', derivation)]
        graph = self.graph(rows)
        nodes = {n['id']:n for n in graph['concepts']}
        edge = next(r for r in graph['relationships'] if r['predicate']=='supports')
        self.assertEqual(nodes[edge['source']]['label'], support)
        self.assertEqual(nodes[edge['target']]['label'], claim)
        self.assertEqual(edge['status'], 'authored structure')
        edge = next(r for r in graph['relationships'] if r['predicate']=='has elaboration')
        self.assertEqual(edge['evidence'][1]['slideId'], '2')

    def test_question_answer_and_private_notes(self):
        question, answer = 'Does more data remove systematic bias?', 'More data reduces variance but can leave systematic bias.'
        graph = self.graph([slide(1, 'Bias', question+'\n'+answer, semanticTiers=dict(roles=[
            dict(role='hook', text=question), dict(role='answer', text=answer),
            dict(role='takeaway', text='Secret private source-only statement.')], notes=[dict(text='Secret private notes.')]))])
        self.assertTrue(any(r['predicate']=='answered by' for r in graph['relationships']))
        self.assertFalse(any('Secret' in n['label'] for n in graph['concepts']))

    def test_cross_slide_links_use_distinctive_content_not_adjacency(self):
        graph = self.graph([slide(1,'Estimator variance','Regularization reduces estimator variance.'),
                            slide(2,'Geometry','Triangles have three sides.'),
                            slide(3,'Regularization tradeoff','Regularization trades bias for lower estimator variance.')])
        edges = [r for r in graph['relationships'] if r['predicate']=='shares topic']
        self.assertTrue(edges)
        self.assertTrue(all({e['slideId'] for e in r['evidence']}=={'1','3'} for r in edges))
        self.assertTrue(all(r['status']=='heuristic' and 'No causal' in r['qualification'] for r in edges))

    def test_repeated_messages_merge_without_losing_late_evidence(self):
        claim = 'Regularization reduces estimator variance.'
        graph = self.graph([slide(i,'Estimation',claim,keyMessages=[dict(text=claim)]) for i in range(1,8)])
        node = next(n for n in graph['concepts'] if n['label']==claim)
        self.assertEqual(len(node['mentions']), 7)

    def test_pdf_and_non_latin_and_blank_slides(self):
        rows = [slide(1,'统计学习','正则化可以降低估计方差，但可能引入偏差。'),
                slide(2,'几何关系','三角形包含三条边。'),
                dict(id='blank',page=3,title='',text='',section='Talk',width=720,height=405)]
        graph = self.graph(rows)
        self.assertTrue(any('正则化' in n['label'] for n in graph['concepts']))
        self.assertTrue(any(ref['kind']=='visual' for n in graph['concepts'] for ref in n['mentions']))
        self.assertEqual(len({n['id'] for n in graph['concepts']}),len(graph['concepts']))

    def test_compiled_geometry_recovers_macro_roles_and_math_spacing(self):
        text='The transpose X⊤\nr constrains every feasible direction.'
        rows=[slide(1,'Transpose',text,textRegions=[dict(text='The transpose X ⊤ r constrains every feasible direction.',x=30,y=100,width=400,height=40)],
                    semanticTiers=dict(roles=[dict(role='takeaway',id='direction',text='',x=20,y=90,width=500,height=70)],
                                       deep=[dict(to='direction',slideId='2')])),
              slide(2,'Derivation','Every feasible direction lies in the model space.')]
        graph=self.graph(rows)
        node=next(n for n in graph['concepts'] if n.get('selection',{}).get('role')=='takeaway')
        self.assertIn('X⊤ r',node['label'])
        self.assertEqual(node['selection']['origin'],'typst-role')
        self.assertTrue(any(r['predicate']=='has elaboration' for r in graph['relationships']))

    def test_complete_question_wins_over_wrapped_fragment(self):
        graph=self.graph([slide(1,'Least squares','Why does X⊤\nappear in least squares?',textRegions=[
            dict(text='Why does X ⊤ appear in least squares?',x=30,y=120,width=400,height=40)])])
        self.assertEqual(next(n['label'] for n in graph['concepts'] if n['type']=='message'),'Why does X⊤ appear in least squares?')

    def test_outline_reuses_section_without_inventing_a_relationship(self):
        graph=self.graph([slide(1,'Outline','Learning\n1. Estimation\n2. Geometry')])
        self.assertEqual(len(graph['concepts']),1)
        self.assertEqual(graph['concepts'][0]['label'],'Learning')
        self.assertEqual(graph['relationships'],[])

    def test_wrapped_conclusion_wins_over_table_and_bibliography(self):
        claim='Ridge reduces both noise amplification and true signal in the weak direction.'
        graph=self.graph([slide(1,'Ridge tradeoff','(An Author, 2002)\nDirection Exact gain Ridge gain\nDifference 50 25 50%\nRidge reduces both noise amplification and true signal in\nthe weak direction.')])
        self.assertEqual(next(n['label'] for n in graph['concepts'] if n['type']=='message'),claim)


if __name__ == '__main__': unittest.main()
