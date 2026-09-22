import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    /**
     * Off in the build that ships. A sourcemap of this is three and a quarter
     * megabytes against a bundle of seven hundred and eighty kilobytes — four
     * times the whole game, served to every phone that opens it, to hand a
     * readable stack trace to nobody in particular. `npm run dev` maps
     * everything anyway, which is where the stack traces worth reading are.
     */
    sourcemap: false,
    /** three.js is most of it. The soundtrack is fourteen kilobytes of the
     *  rest, which is what a whole score costs when it is written down. */
    chunkSizeWarningLimit: 850,
  },
});
