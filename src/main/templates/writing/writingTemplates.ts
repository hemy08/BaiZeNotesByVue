import { leetcode_problem_solving } from './leetcode-problem-solving'
import { problemResolving } from './problemResolving'
import { thesisTemplates, thesisCoverPage } from './thesis'

export const fileTemplates: MenuContext[] = [
  { label: '力扣题解模板', context: leetcode_problem_solving },
  { label: '问题处理模板', context: problemResolving },
  { label: '文章封面', context: thesisTemplates },
  { label: '论文模板', context: thesisCoverPage }
]
