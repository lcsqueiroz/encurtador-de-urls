# Encurtador de URLs com Analytics e Expiração

**Especificação de Projeto Backend**  
*Desenvolvimento de Web Service em Node.js, TypeScript e SQLite puro (sem ORM e sem assistência de IA)*

> **Objetivo Pedagógico:** Desenvolver o raciocínio lógico, manipulação de strings, validação de dados, controle de fluxo e escrita de SQL puro sem depender de ferramentas de geração automática de código ou abstrações de ORMs.

---

## 1. Regras e Restrições de Desenvolvimento

* **Zero Assistência de IA:** Não utilize ferramentas de autocompletar por IA ou chats geradores de código durante a implementação. Consulte apenas documentações oficiais (MDN Web Docs, Node.js Docs, SQLite Docs e Express/Fastify Docs) e fóruns técnicos para dúvidas pontuais de sintaxe.
* **Sem ORM ou Query Builders:** É proibido usar Prisma, TypeORM, Drizzle ou Knex. Toda interação com o banco deve ser feita com queries SQL puras (`CREATE TABLE`, `INSERT`, `SELECT`, `UPDATE`, `DELETE`).
* **Driver SQLite Direto:** Utilize o módulo nativo `node:sqlite` (disponível a partir do Node.js v22.5+) ou a biblioteca `better-sqlite3` com consultas síncronas parametrizadas (`?`) para evitar SQL Injection.
* **Tipagem Estrita:** Configure o `tsconfig.json` com `"strict": true`. Evite o uso de `any`; defina interfaces claras para os registros do banco e payloads HTTP.

---

## 2. Arquitetura e Organização dos Arquivos

Mantenha o projeto enxuto e separado por responsabilidades em apenas três arquivos principais dentro da pasta `src/`:

| Arquivo | Responsabilidade e Restrições |
| :--- | :--- |
| `src/shortener.ts` | **Lógica Pura e Algoritmos:** Contém funções de validação de URL, validação de alias customizado, geração de código aleatório e cálculo de datas de expiração. Não deve importar nada de HTTP ou SQLite. |
| `src/database.ts` | **Camada de Persistência:** Inicializa a conexão com o arquivo `database.sqlite`, cria as tabelas se não existirem e exporta funções tipadas para salvar, buscar, deletar e contar registros. |
| `src/server.ts` | **Camada HTTP (Web Service):** Configura o servidor (Express ou Fastify), valida os corpos das requisições, orquestra chamadas entre `shortener.ts` e `database.ts` e retorna os status codes adequados. |

---

## 3. Estrutura do Banco de Dados (SQLite)

O banco deve conter duas tabelas relacionadas pelo código curto da URL. Execute estes comandos na inicialização do servidor:

```sql
CREATE TABLE IF NOT EXISTS urls (
  code TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_code TEXT NOT NULL,
  clicked_at INTEGER NOT NULL,
  FOREIGN KEY (url_code) REFERENCES urls(code) ON DELETE CASCADE
);
```

*Nota sobre datas:* Armazene todos os campos de data/hora (`created_at`, `expires_at`, `clicked_at`) como números inteiros representando milissegundos Unix (`Date.now()`). Isso simplifica comparações matemáticas e filtros temporais tanto no TypeScript quanto no SQL.

---

## 4. Algoritmos Obrigatórios (Implementação Manual)

* **Algoritmo 1 — Validação de URL:** Verifique se a URL recebida é uma string não vazia, inicia obrigatoriamente com `http://` ou `https://` e possui um domínio válido. Você pode implementar usando expressão regular (Regex) ou tratando exceções do construtor nativo `new URL(input)`.
* **Algoritmo 2 — Gerador de Código Aleatório (Base62):** Crie uma constante com os 62 caracteres permitidos (`A-Z`, `a-z`, `0-9`). Use um laço `for` para sortear 6 índices aleatórios com `Math.random()` e `Math.floor()`. Antes de retornar o código, verifique no banco se ele já existe; caso exista, repita o processo em um laço `while` até obter um código inédito.
* **Algoritmo 3 — Validação de Alias Customizado:** Caso o cliente informe um `customAlias`, valide na mão se ele possui entre 3 e 20 caracteres e contém apenas letras, números, hífens (`-`) ou underscores (`_`). Rejeite palavras reservadas como `shorten` e `stats`.
* **Algoritmo 4 — Verificação de Expiração e Janela Deslizante:** Ao acessar um link, compare `Date.now() > url.expires_at` (quando `expires_at` não for nulo). Para as estatísticas de cliques recentes, calcule o limite inferior (`Date.now() - 5 * 60 * 1000`) e filtre os registros ocorridos nos últimos 5 minutos.

---

## 5. Especificação dos Endpoints (API REST)

### `POST /shorten` — Criar uma nova URL encurtada

Recebe uma URL longa e parâmetros opcionais de personalização e tempo de vida.

**Exemplo de Entrada (JSON):**
```json
{
  "url": "https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Map",
  "customAlias": "mdn-map",
  "expiresInMinutes": 30
}
```

| Status HTTP | Condição | Corpo da Resposta (JSON) |
| :--- | :--- | :--- |
| `201 Created` | URL válida e código gerado/salvo com sucesso. | `{ "code": "mdn-map", "shortUrl": "http://localhost:3000/mdn-map", "originalUrl": "https://...", "expiresAt": 1794964200000 }` |
| `400 Bad Request` | URL ausente/inválida, alias fora do padrão ou `expiresInMinutes <= 0`. | `{ "error": "URL inválida. Informe um endereço http ou https." }` |
| `409 Conflict` | O `customAlias` informado já está em uso no banco de dados. | `{ "error": "Este alias customizado já está em uso." }` |

---

### `GET /:code` — Redirecionar para a URL original

Busca o código curto no banco, valida expiração, contabiliza o clique na tabela `clicks` e redireciona o navegador.

| Status HTTP | Condição | Comportamento / Resposta |
| :--- | :--- | :--- |
| `302 Found` | Código encontrado e dentro do prazo de validade. | Insere registro em `clicks` e envia cabeçalho `Location` com a URL original. |
| `404 Not Found` | O código informado não existe na tabela `urls`. | `{ "error": "URL encurtada não encontrada." }` |
| `410 Gone` | A URL existe, mas `expires_at` é menor que o timestamp atual. | Remove a URL expirada do banco e retorna `{ "error": "Este link expirou." }`. |

---

### `GET /stats/:code` — Consultar métricas de acesso

Retorna os dados cadastrais do link, o total acumulado de cliques e a atividade recente nos últimos 5 minutos.

**Exemplo de Saída — `200 OK`:**
```json
{
  "code": "mdn-map",
  "originalUrl": "https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Map",
  "createdAt": "2026-11-17T22:15:00.000Z",
  "expiresAt": "2026-11-17T22:45:00.000Z",
  "totalClicks": 14,
  "clicksLast5Minutes": 3
}
```

*Nota:* Caso o `code` não exista, retorne `404 Not Found`. Se estiver expirado, retorne `410 Gone`.

---

## 6. Checklist de Testes Manuais (Critérios de Aceite)

Antes de considerar o projeto concluído, valide todos os cenários abaixo utilizando Insomnia, Postman ou `curl`:

1. [ ] Enviar uma URL sem protocolo (ex: `google.com`) no `POST /shorten` e receber status `400`.
2. [ ] Criar um link sem `customAlias` e verificar se o código gerado possui exatamente 6 caracteres alfanuméricos.
3. [ ] Tentar criar dois links com o mesmo `customAlias` e receber status `409` na segunda tentativa.
4. [ ] Acessar `GET /:code` pelo navegador e confirmar o redirecionamento automático para o site de destino.
5. [ ] Consultar `GET /stats/:code` logo após 3 acessos e confirmar `totalClicks: 3` e `clicksLast5Minutes: 3`.
6. [ ] Criar um link com `"expiresInMinutes": 1`, aguardar 61 segundos, tentar acessá-lo e confirmar o retorno `410 Gone`.

---

## 7. Desafios Extras (Opcional — Nível Intermediário)

* **Rota de Limpeza (`DELETE /expired`):** Crie um endpoint administrativo que varre o banco de dados e apaga todas as URLs expiradas, retornando quantos registros foram removidos.
* **Transação Atômica no Redirecionamento:** Garanta que a leitura da URL e a gravação do clique ocorram dentro de uma transação SQLite (`BEGIN` / `COMMIT`) para evitar inconsistências caso o link seja deletado simultaneamente.
* **Ranking Top 5 (`GET /top`):** Escreva uma query SQL com `JOIN`, `GROUP BY` e `ORDER BY` que retorne as 5 URLs mais acessadas do sistema.
