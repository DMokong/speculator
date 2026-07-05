import { gamma } from "./util/gamma";

export function alphaMain(input: string): string {
  return gamma(input).toUpperCase();
}

export class AlphaService {
  run(x: number): number {
    return helper(x) + 1;
  }
}

function helper(x: number): number {
  return x * 2;
}
