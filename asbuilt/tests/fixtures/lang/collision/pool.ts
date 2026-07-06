import { helper } from "./util";

export function connect(client: { release(): void }): void {
  client.release();
}

export class Pool {
  private tidy(): void {}
  drain(): void {
    this.tidy();
    helper();
  }
}
