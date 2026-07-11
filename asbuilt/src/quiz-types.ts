// Shared candidate-question shapes for the As-Built Comprehension Quiz
// Generator (SPEC-058). Every quiz-* module imports these instead of
// redefining them.

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  id: string;
  category: string;
  prompt: string;
  options: QuizOption[]; // exactly 4, exactly one with correct: true
  citations: string[]; // graph node ids (pr-diff scope) or concept paths (codebase scope)
  explanation: string;
}

export interface QuizPool {
  scope: "pr-diff" | "codebase";
  questions: QuizQuestion[];
}
