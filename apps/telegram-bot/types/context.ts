import { Context } from "telegraf";

export interface MySession {
  waitingForWithdraw?: boolean;
}

export interface MyContext extends Context {
  session: MySession;
}
