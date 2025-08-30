/* eslint-disable no-useless-escape */
import {argv} from 'process';
import {readFile, writeFile} from 'fs/promises';
import {exec} from 'child_process';
import {promisify} from 'util';

const
	C = console.log,
	E = console.error,
  PAD = ' '.repeat(15),
  WIDTH = 38;
const execAsync = promisify(exec);
enum EchoTask {
  Banner = -1,
  Complete = 0,
  Failed = 1,
  Stop = 2,
  CommitFirst = 3,
  StackTrace = 4,
}

function padBoxLine(content: string = ''): string {
  const inner = content.length > WIDTH - 2
    ? content.slice(0, WIDTH - 2)
    : content;
  return `${PAD}| ${inner.padEnd(WIDTH - 2, ' ')} |`;
}

function splitLongLines(msg: string): string[] {
  const maxLen = WIDTH - 2;
  const lines: string[] = [];
  for (const line of msg.split('\n')) {
    let l: string = line;
    while (l.length > maxLen) {
      lines.push(l.slice(0, maxLen));
      l = l.slice(maxLen);
    }
    lines.push(l);
  }
  return lines;
}

function splitMessage(msg: string): string[] {
  const maxLen = WIDTH - 2;
  const parts: string[] = [];
  for (const origLine of msg.split('\n')) {
    let line = '';
    for (const word of origLine.split(' ')) {
      if ((line + (line ? ' ' : '') + word).length > maxLen) {
        if (line) parts.push(line);
        if (word.length > maxLen) {
          for (const sub of splitLongLines(word)) {
            if (sub.length > maxLen) {
              parts.push(sub.slice(0, maxLen));
              line = sub.slice(maxLen);
            } else {
              parts.push(sub);
              line = '';
            }
          }
        } else {
          line = word;
        }
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    if (line) parts.push(line);
  }
  return parts;
}

const echo = (m: EchoTask, t: string = ''):void=>{
	switch (m) {
		case EchoTask.Banner:
			C(`  ......._                                                  _.......
.'        "-.._                                        _..-"        \`.
 ".      .' \` .\`'-~-._                          _.-~-"\`. ' \`.   '  ."
  ".  .         \` .   "-.      _)_.._(_      .-"   . '         .. ."
    ". ...     .. .\`.    \`.   (_)    (_)   .'    .'. ..     ...  ;vnm
      '_   '\` ..      \`.   \\\. | '____' | ./   .'      .. '\`   _.'imp!
        "-.. '  \`   ..      \\\\'-~.__.~-'//      ..   '  \` ..-"
            "\`..          .' . '      ' . \`.          ..'"
           .'"   " .  . '    \`. '.--.' .'    \` .  . "   "\`.
           "            .'   '\\\ \\\    / /\`   \`.            "
            \`... .. .  '    ' (,-\`  '-,) \`    \`  . .. ...'
                     \`.  . "  (--------)  " .  .'
                       "      (--------)      "
                ____________  \`--------'  ____________
               |               \`.____.'               |
               |  CICaDa CI/CD  \`.__.'  Build System  |
               |                                      |`);
			break;
      case EchoTask.Complete:
      C(padBoxLine(`task: ${t.padEnd(9)} Complete!`));
      break;

    case EchoTask.Failed:
      C(padBoxLine(`task: ${t.padEnd(9)} FAILED!`));
      C(PAD + '|' + ' '.repeat(38) + '|');
      break;

    case EchoTask.Stop:
      C(PAD + '|______________________________________|\n');
      break;

    case EchoTask.CommitFirst:
      E(padBoxLine('commit your changes first!'));
      break;

    case EchoTask.StackTrace:
      if (t instanceof Error) {
        for (const msgLine of splitMessage((t as Error).message)) {
          E(padBoxLine(msgLine));
        }
        for (const traceLine of (t as Error).stack?.split('\n').slice(1) || []) {
          for (const msgLine of splitMessage(traceLine.trim())) {
            E(padBoxLine(msgLine));
          }
        }
      } else if (typeof t === 'string' && t.length > 0) {
        for (const msgLine of splitMessage(t)) {
          E(padBoxLine(msgLine));
        }
      }
      echo(2);
      break;
      default:
      if (t && t.length) {
        for (const msgLine of splitMessage(t)) {
          E(padBoxLine(msgLine));
        }
      } else {
        E(padBoxLine(''));
      }
      break;
	}
};

const clean = async(): Promise<void>=>{
  await execAsync('rm -rf ./dist');
  await execAsync('cp -r ./src/www/ ./dist');
};

const style = async(): Promise<void>=>{
  const {stdout, stderr} = await execAsync(
    'postcss src/style/editor.css -o dist/editor.min.css'
  );
  let css = await readFile('./dist/editor.min.css', 'utf8');
  if (!css || css.trim().length === 0) {
    echo(4, stderr || stdout);
    throw new Error('PostCSS failed');
  }
  css = css.replace(/^\/\*![\s\S]*?\*\//, '/*! ┳━┓┏┓┓┓━┓o ┏━┓┓ ┳ ┏┓┓┏━┓\n    ┃━┫┃┃┃┗━┓┃ ┃/┃┃┃┃ ┃┃┃┏━┛\n    ┛ ┇┇┗┛━━┛┇o┛━┛┗┻┇o┇┗┛┗━┛ */\n');
  await writeFile('./dist/editor.min.css', css);
  await uncache();
};

const script = async(): Promise<void>=>{
  const {stdout, stderr} = await execAsync(
    'esbuild src/scripts/main.ts --bundle --minify --outfile=dist/app.min.js'
  );
  const js = await readFile('./dist/app.min.js', 'utf8');
  if (!js || js.trim().length === 0) {
    echo(4, stderr || stdout);
    throw new Error('esbuild failed');
  }
  await uncache();
};

const uncache = async(): Promise<void>=>{
  await execAsync('cp ./src/www/index.html ./dist/index.html');
  let indexHtml = await readFile('./dist/index.html', 'utf8');
  indexHtml = indexHtml.replace(/build/g, String(Math.floor(Date.now() / 1000)));
  await writeFile('./dist/index.html', indexHtml);
};

const release = async(): Promise<void>=>{
  const {stdout: status} = await execAsync('git status --porcelain');
  const statusStr = Buffer.from(status).toString();
  if (statusStr.trim() !== '') {
    echo(3);
    echo(1);
    process.exit(1);
  }
  await execAsync('npm version patch');
  const sitemapPath = 'src/sitemap.xml';
  let sitemap = await readFile(sitemapPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  sitemap = sitemap.replace(
    /<lastmod>.*<\/lastmod>/,
    `<lastmod>${today}</lastmod>`
  );
  await writeFile(sitemapPath, sitemap);
  await execAsync(`git add ${sitemapPath}`);
  await execAsync(`git commit -m 'chore: update sitemap lastmod for release'`);
};

const task = async(f: () => Promise<void>, t: string): Promise<void>=>{
	try {
		await f();
		echo(0, t);
	} catch (e) {
		echo(1, t);
		throw e;
	}
};

const build = async(): Promise<void>=>{
	await task(clean, 'clean');
	await task(style, 'style');
	await task(script, 'script');
};

const actions: Partial<Record<string,()=>Promise<void>>> = {
	build,
	clean,
	release,
	script,
	style,
	uncache,
};

const main = async(): Promise<void>=>{
	echo(-1);
	const args = argv.slice(2);
	try {
		if (args.length === 0) {
			await build();
			echo(2);
			return;
		}
		for (const arg of args) {
			if (actions[arg]) {
				await task(actions[arg], arg);
				echo(2);
			} else {
				echo(1, arg);
				process.exit(1);
			}
		}
	} catch (e) {
    echo(4,e);
		process.exit(1);
	}
};

await main();
