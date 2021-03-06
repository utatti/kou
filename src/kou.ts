import * as yargs from 'yargs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runWASM, magicNumber } from './wasm';
import { reportCompileError } from './report-error';
import { Compose } from './util';
import { tokenize } from './lexer';
import { parse } from './parser';
import { desugarBefore, desugarAfter } from './desugarer';
import { typeCheck } from './typechecker';
import { TypeContext } from './typechecker/context';
import { genWASM } from './codegen';

interface Argv {
  source: string;
  main: string;
  memory: number;
}

async function main(argv: Argv) {
  const sourcePath = resolve(argv.source);
  const buffer = readFileSync(sourcePath);

  let bytecode: Buffer;
  if (buffer.slice(0, 4).equals(magicNumber)) {
    // wasm bytecode
    bytecode = buffer;
  } else {
    // maybe kou code
    const compile = Compose.then(tokenize)
      .then(parse)
      .then(desugarBefore)
      .then(mod => typeCheck(mod, new TypeContext()))
      .then(desugarAfter)
      .then(mod =>
        genWASM(mod, { exports: [argv.main], memorySize: argv.memory }),
      ).f;

    const input = buffer.toString();
    try {
      bytecode = compile(input);
    } catch (err) {
      return reportCompileError(input, err);
    }
  }

  const result = await runWASM(bytecode, {
    main: argv.main,
    memorySize: argv.memory,
  });
  console.log(result.value);
}

main(yargs
  .usage('$0 [args] <source>', 'kou Programming Language CLI')
  .help()
  .option('main', {
    desc: 'An exported function to run',
    type: 'string',
    default: 'main',
  })
  .option('memory', {
    alias: 'm',
    desc: 'Memory size in MiB',
    type: 'number',
    default: 128,
  }).argv as any).catch(err => {
  console.error(err);
  process.exit(1);
});
