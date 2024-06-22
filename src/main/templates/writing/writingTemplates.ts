import { leetcode_problem_solving } from './leetcode-problem-solving'
import { problemResolving } from './problemResolving'
import { thesisTemplates, thesisCoverPage } from './thesis'

export const fileTemplates = {
  imageLinks: { label: '力扣题解模板', data: leetcode_problem_solving },
  blockCode: { label: '问题处理模板', data: problemResolving },
  linksList: { label: '文章封面', data: thesisTemplates },
  lastUpdate: { label: '论文模板', data: thesisCoverPage }
}
