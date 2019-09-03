const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const postCssLoader = {
    loader: 'postcss-loader',
    options: {
        plugins: [require('autoprefixer')]
    }
};
module.exports = (env, argv) => ({
    entry: './src/index.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'angular-moment-calendar.js',
    },
    stats: 'minimal',
    mode: argv.mode || 'development',
    devtool: argv.mode !== 'production' ? 'source-map' : undefined,
    externals: [
        'angular',
        'moment',
    ],
    resolve: {
        extensions: ['.ts', '.js', '.scss']
    },
    module: {
        rules: [
            { test: /\.ts$/, use: 'ts-loader' },
            { test: /\.scss$/, use: [MiniCssExtractPlugin.loader, 'css-loader', postCssLoader, 'sass-loader'] },
            { test: /\.html$/, use: ['html-loader?minimize=true'] },
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({ moment: 'moment' }),
        new MiniCssExtractPlugin({ filename: 'angular-moment-calendar.css' }),
    ],
});