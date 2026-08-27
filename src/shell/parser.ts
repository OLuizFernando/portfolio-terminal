import { ShellError, tokenize, type Separator, type Token, type Word } from './lexer';

export interface Redirect {
  op: '>' | '>>';
  target: string;
}

export interface SimpleCommand {
  argv: Word[];
  redirect: Redirect | null;
}

export type Pipeline = SimpleCommand[];

export interface ScriptItem {
  pipeline: Pipeline;
  /** Operador que liga esta pipeline à próxima. `null` na última. */
  separator: Separator | null;
}

export type Script = ScriptItem[];

const syntaxError = (token: string) =>
  new ShellError(`bash: syntax error near unexpected token \`${token}'`);

/** `cd x && ls | grep y > out` → lista de pipelines encadeadas por operador. */
export function parse(input: string): Script {
  const tokens = tokenize(input);
  const script: Script = [];

  let pipeline: Pipeline = [];
  let command: SimpleCommand = { argv: [], redirect: null };

  const isEmpty = (cmd: SimpleCommand) => cmd.argv.length === 0 && cmd.redirect === null;

  const closeCommand = (token: string) => {
    if (isEmpty(command)) throw syntaxError(token);
    pipeline.push(command);
    command = { argv: [], redirect: null };
  };

  const closePipeline = (separator: Separator | null, token: string) => {
    closeCommand(token);
    script.push({ pipeline, separator });
    pipeline = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;

    if (token.type === 'pipe') {
      closeCommand('|');
      continue;
    }

    if (token.type === 'separator') {
      closePipeline(token.op, token.op);
      continue;
    }

    if (token.type === 'redirect') {
      const next = tokens[i + 1];
      if (!next || next.type !== 'word') throw syntaxError('newline');
      command.redirect = { op: token.op, target: next.word.value };
      i++;
      continue;
    }

    command.argv.push(token.word);
  }

  if (!isEmpty(command)) {
    pipeline.push(command);
    script.push({ pipeline, separator: null });
  } else if (pipeline.length > 0) {
    throw syntaxError('newline');
  }

  // Um `;` sobrando no fim é legítimo; um `&&` sobrando não.
  const last = script[script.length - 1];
  if (last && last.separator !== null && last.separator !== ';') throw syntaxError('newline');
  if (last) last.separator = null;

  for (const item of script) {
    for (const cmd of item.pipeline) {
      if (cmd.argv.length === 0) throw syntaxError('|');
    }
  }

  return script;
}

export { ShellError };
