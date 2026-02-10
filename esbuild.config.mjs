import esbuild from 'esbuild';

const prod = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['main.ts'],
  bundle: true,
  outfile: 'main.js',
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  sourcemap: prod ? false : 'inline',
  minify: prod,
  external: ['obsidian']
});

if (watch) {
  await ctx.watch();
  console.log('Watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Built main.js');
}
