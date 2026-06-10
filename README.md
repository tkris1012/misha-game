# みしゃゲーム

子供向け英単語学習ゲーム。「ことばを食べて育つ、自分だけの相棒」を育てながら、日常会話に必要な英単語(約2,000語)を楽しく身につける。

- 要件: [要件定義書.md](./要件定義書.md)
- 必須要件: 全英単語の読み上げ機能/女の子向けのラブリーなデザイン
- 配信: GitHub Pages(`main` ブランチへの push で `public/` が自動デプロイされる)

## 開発状況

要件定義フェーズ。**MVPの実装はオーナーの指示があるまで未着手。**

## デプロイ

`main` に push すると GitHub Actions([.github/workflows/deploy.yml](./.github/workflows/deploy.yml))が `public/` フォルダを GitHub Pages に公開する。ゲーム本体は将来 `public/` 配下に配置する。
