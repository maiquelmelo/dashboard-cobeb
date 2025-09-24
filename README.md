# Dashboard Cobeb (padrão `/docs` para GitHub Pages)

Este projeto já está pronto para ser publicado no **GitHub Pages** usando a pasta **/docs**.

## Publicar
1. Crie um repositório (ex.: `dashboard-cobeb`).
2. Envie **esta pasta** para o repositório (mantenha a estrutura `docs/`).
3. Em **Settings → Pages**:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main`
   - **Folder**: `/docs`
4. Salve. A página ficará disponível em `https://SEU_USUARIO.github.io/NOME_DO_REPO/`.

## Rodar localmente
- Via Python:
  ```bash
  cd docs
  python -m http.server 5500
  # acesse http://localhost:5500
  ```
- ou VS Code + extensão **Live Server** (abra a pasta `docs/` e use “Go Live”).

## Atualizar dados
Substitua `docs/data/dados.csv` (mesmo cabeçalho) **ou** use o importador/validador no topo da página para carregar `.xlsx` ou `.csv`.

> As bibliotecas são carregadas via CDN. Incluímos `.nojekyll` para evitar processamento pelo Jekyll.