import { leetcode_problem_solving } from './leetcode-problem-solving'
import { problemResolving } from './problemResolving'
import { thesisTemplates, thesisCoverPage } from './thesis'

export class writeTemplates {
  leetcodeIssue: string
  problemResolving: string
  thesisTemplates: string
  thesisCoverPage: string

  constructor() {
    this.leetcodeIssue = leetcode_problem_solving
    this.problemResolving = problemResolving
    this.thesisTemplates = thesisTemplates
    this.thesisCoverPage = thesisCoverPage
  }
}
