# Migração do SOSPC para Supabase (fase 1)

## 1. Instale a dependência
```bash
npm install
```

## 2. Crie o projeto no Supabase
Copie a URL do projeto e a anon key.

## 3. Configure o arquivo `.env`
Use `.env.example` como base:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## 4. Execute o SQL
No SQL Editor do Supabase, rode o arquivo `sql/supabase_app_state.sql`.

## 5. Primeira sincronização
Com o sistema já carregado com seus dados atuais no navegador, acesse a tela de login e entre normalmente.
Depois disso, qualquer tela salva no app vai passar a sincronizar o conteúdo no Supabase.

## 6. Observação importante
Essa fase troca o `localStorage` por um armazenamento remoto em tabela `app_state`, mantendo o formato atual dos dados do sistema.
O próximo passo ideal é migrar para tabelas relacionais (clients, products, orders, sales, receivables etc.) e autenticação real.
