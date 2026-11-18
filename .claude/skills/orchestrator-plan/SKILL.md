---
name: orchestrator-plan
description: Quando usar esta skill, em uma frase.
---

Versão: v3
Mudança v2: acrescentadas 11 lições da migração VetCare (fases 5B-7) sobre delegação, verificação, commits e fins de linha.
Mudança v3: ajustadas 2 lições (recusa de .md e limite de turnos) e acrescentadas 5 da validação em BD real (fase V): permissões no preflight, fixture em commit e impressão digital, sed e CRLF, texto ditado ao executor e DIVERGE como defeito do procedimento.

# Passo a passo
1. (primeiro passo)
2. (segundo passo)
3. (como verificar que ficou certo)

# Lições aprendidas
- Executor recusa gravar relatórios .md se o pedido não autorizar o ficheiro de forma explícita: nomear o caminho e dizer que está autorizado. (v3) Mesmo autorizado, recusou várias vezes (V.2, V.3b, V.2b). Pedir os resultados em JSON ou txt no scratchpad e o orchestrator grava o .md de evidência a partir deles.
- Executores em paralelo veem as alterações uns dos outros: commitar sempre com caminhos explícitos, nunca `git add -A`/`git add .`.
- Executores que mexem no mesmo ficheiro correm em sequência, não em paralelo.
- O executor tem limite de ~30 turnos: partir tarefas grandes e pedir escrita incremental do resultado. (v3) Quando parar sem relatório, ler o ficheiro incremental e o estado real (git, BD) antes de relançar. Completar só o que falta; não refazer passos com efeitos (ex.: fixture em commit).
- Pedir teste de mutação como prova (estragar o código e ver o teste falhar), não só "o teste passa".
- Scripts de verificação têm de cobrir várias tabelas/ficheiros; não assumir que só existe um caso.
- Não usar isolation worktree para ficheiros não rastreados (ex.: memoria/): o executor acaba por editar o repositório principal pelo caminho absoluto.
- No Git Bash do Windows, `grep -c $'\r'` não é fiável para contar CR: usar contagem de bytes em Node ou `git ls-files --eol`.
- Conferir sozinho a gravidade dos achados de auditoria antes de aceitar Crítico/Alto: vários vinham sobrestimados (reler o código e o histórico).
- Trailer de commit: o executor segue a atribuição do próprio harness (Haiku) e recusa assinar com outro modelo. Decidir antes: o executor faz gate e stage, e o orchestrator cria o commit com o seu trailer.
- Executores podem mudar o trailer do commit: conferir sempre com `git log -1 --format='%(trailers)'`.
- (v3) Validação em BD: verificar as permissões da conta no preflight (BACKUP, VIEW SERVER STATE) antes de planear restauros ou provas por DMV. Sem backup, usar uma impressão digital por tabela antes e depois.
- (v3) Um teste com fixture em commit muda a impressão digital enquanto corre: sequenciá-lo depois dos testes que a comparam.
- (v3) Neste ambiente, `sed -i` remove os CR dos ficheiros CRLF. Em ficheiros w/crlf usar só Edit ou Node e conferir com `git ls-files --eol`.
- (v3) O texto exato que o orchestrator dita ao executor também pode estar errado. Aceitar desvios fundamentados com file:linha (ex.: o TypeORM declara `where` dos índices) e conferir antes de reverter.
- (v3) Expectativas de um procedimento escrito só com leitura de código falham em motor real (atomicidade de THROW em trigger, fixtures que colidem com índices únicos). Tratar DIVERGE primeiro como possível defeito do procedimento e fazer um teste de seguimento que separe as hipóteses.
