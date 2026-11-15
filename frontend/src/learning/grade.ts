export type Question = {id:string; answer:number; options:string[]}
export function gradeAnswers(questions: Question[], answers: Record<string, number>) {
  const complete = questions.length > 0 && questions.every(q => Number.isInteger(answers[q.id]) && answers[q.id] >= 0 && answers[q.id] < q.options.length)
  const correct = questions.filter(q => answers[q.id] === q.answer).length
  return {complete, correct, score: complete ? Math.round(100 * correct / questions.length) : null}
}
