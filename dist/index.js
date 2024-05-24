// src/index.ts
import path from "path";
import color from "picocolors";
import MagicString from "magic-string";
import { js } from "@ast-grep/napi";
var pluginName = "vite:lib-inject-css";
var excludeTokens = /* @__PURE__ */ new Set(["expression_statement", "import_statement"]);
var createPreserveModulesWarning = (optionPath) => "When `" + optionPath + "` is `true`, the association between chunk file and its css references will lose, so the style code injection will be skipped.";
function libInjectCss({
  base = "/",
  injectionType = "IMPORT"
} = {}) {
  let skipInject = false;
  let resolvedConfig;
  return {
    name: pluginName,
    apply: "build",
    enforce: "post",
    config({ build }) {
      for (const item of [build?.rollupOptions?.output].flat()) {
        if (item && typeof item.hoistTransitiveImports !== "boolean") {
          item.hoistTransitiveImports = false;
        }
      }
      return {
        build: {
          /**
           * Must enable css code split, otherwise there's only one `style.css` and `chunk.viteMetadata.importedCss` will be empty.
           * @see https://github.com/vitejs/vite/blob/HEAD/packages/vite/src/node/plugins/css.ts#L613
           */
          cssCodeSplit: true,
          /**
           * Must emit assets on SSR, otherwise there won't be any CSS files generated and the import statements
           * injected by this plugin will refer to an undefined module.
           * @see https://github.com/vitejs/vite/blob/HEAD/packages/vite/src/node/plugins/asset.ts#L213-L218
           */
          ssrEmitAssets: true
        }
      };
    },
    configResolved(config) {
      resolvedConfig = config;
    },
    options() {
      const { build, command } = resolvedConfig;
      const outputOptions = [build.rollupOptions.output].flat();
      const messages = [];
      if (!build.lib || command !== "build") {
        skipInject = true;
        messages.push(
          "Current is not in library mode or building process, skip code injection."
        );
      }
      if (outputOptions.some((v) => v?.preserveModules === true)) {
        skipInject = true;
        messages.push(
          createPreserveModulesWarning("rollupOptions.output.preserveModules")
        );
      }
      if (parseInt(this.meta.rollupVersion) < 4 && // @ts-ignore
      build.rollupOptions.preserveModules === true) {
        skipInject = true;
        messages.push(
          createPreserveModulesWarning("rollupOptions.preserveModules")
        );
      }
      if (build.ssr && build.ssrEmitAssets === false) {
        messages.push(
          "`config.build.ssrEmitAssets` is set to `true` by the plugin internally in library mode, but it seems to be `false` now. This may cause style code injection to fail on SSR, please check the configuration to prevent this option from being modified."
        );
      }
      messages.forEach(
        (msg) => console.log(
          `
${color.cyan(`[${pluginName}]`)} ${color.yellow(msg)}
`
        )
      );
    },
    generateBundle({ format }, bundle) {
      if (skipInject)
        return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.viteMetadata?.importedCss.size) {
          continue;
        }
        const node = js.parse(chunk.code).root().children().find((node2) => !excludeTokens.has(node2.kind()));
        const position = node?.range().start.index ?? 0;
        let code = chunk.code;
        for (const cssFileName of chunk.viteMetadata.importedCss) {
          let cssFilePath = path.relative(path.dirname(chunk.fileName), cssFileName).replaceAll(/[\\/]+/g, "/");
          cssFilePath = cssFilePath.startsWith(".") ? cssFilePath : `./${cssFilePath}`;
          const injection = injectionType === "DOC" ? createStyleSheet(base + cssFileName) : format === "es" ? `import '${cssFilePath}';` : `require('${cssFilePath}');`;
          if (injectionType === "DOC") {
            code = injection + code;
          } else {
            code = code.slice(0, position) + injection + code.slice(position);
          }
        }
        chunk.code = code;
        if (resolvedConfig.build.sourcemap) {
          const ms = new MagicString(code);
          chunk.map = ms.generateMap({ hires: "boundary" });
        }
      }
    }
  };
}
var createStyleSheet = (src) => `(()=>{if(typeof window==='undefined')return;const linkTag=document.createElement('link');linkTag.rel='stylesheet';linkTag.type='text/css';linkTag.href='${src}';document.head.appendChild(linkTag);})();
`;
export {
  libInjectCss
};
