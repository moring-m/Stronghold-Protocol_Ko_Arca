import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('../tools/local-extract/cn-skins-START.ps1',import.meta.url),'utf8');
const probe=source.match(/\$probeCode = "([^"]+)"/)[1];
function simulate(version,bytes){return spawnSync('python3',['-c',`import sys,struct; sys.executable='C:\\\\Users\\\\유민\\\\Python\\\\python.exe'; sys.version_info=(${version.join(',')}); struct.calcsize=lambda _: ${bytes}; ${probe}`],{encoding:'utf8'});}
test('launcher preserves Korean paths without reading sys.executable from stdout',()=>{
 assert.doesNotMatch(source,/print\(sys\.executable/);
 assert.match(source,/& \$bootstrapCommand @bootstrapArgs -m venv \.venv/);
 const r=simulate([3,12,10],8);assert.equal(r.status,0);assert.equal(r.stdout.trim(),'supported');assert.ok([...r.stdout].every(c=>c.codePointAt(0)<128));
});
test('Python 3.15 and 32-bit Python are rejected before installing packages',()=>{
 for(const [version,bytes]of [[[3,15,0],8],[[3,12,10],4],[[3,11,0],8]])assert.equal(simulate(version,bytes).stdout.trim(),'unsupported');
 assert.match(source,/Test-Python312 'py' @\('-3\.12'\)/);
 assert.match(source,/Rename-Item.*\.venv/);
 assert.match(source,/& py install 3\.12/);
 assert.match(source,/--only-binary=:all: --no-binary=tpk_ar -r/);
});
