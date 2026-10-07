import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/platform-sdk.js',
    format: 'iife',
    name: 'GamePlatform',
    sourcemap: false,
  },
  plugins: [
    terser({
      compress: { passes: 2 },
    }),
  ],
};
