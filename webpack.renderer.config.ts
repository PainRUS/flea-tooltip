import type { Configuration } from "webpack";
import path from "path";

import { rules } from "./webpack.rules";
import { plugins } from "./webpack.plugins";

rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" },
    { loader: "css-loader" },
    { loader: "postcss-loader" },
  ],
});

rules.push({
  test: /\.(woff|woff2|eot|ttf|otf)$/i,
  type: "asset/resource",
});

rules.push({
  test: /\.(wav|mp3|ogg|m4a)$/i,
  type: "asset/resource",
});

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
    // FleaTooltip only uses @number-flow/react for the Total value. The
    // animated custom element leaves multiple digit layers visibly stacked in
    // this Electron renderer, so use a plain-text compatibility renderer for
    // this application instead.
    alias: {
      "@number-flow/react": path.resolve(
        __dirname,
        "renderer/components/StaticNumberFlow.tsx"
      ),
    },
  },
  // target: 'electron-renderer',
};
