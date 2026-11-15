# Uniformização do schema e catálogo de animais

A migration `UniformSchemaAndAnimalCatalog1794744000000` sucede à migration inicial SQL Server. Não foi executada automaticamente contra qualquer base de dados. A configuração mantém `synchronize: false` e `migrationsRun: false`.

## Aplicação

1. Fazer backup e testar o restauro numa base de dados de ensaio.
2. Parar escritas da API e executar primeiro as migrations numa cópia representativa: `npm run db:migrate`.
3. Conferir contagens de animais/reservas/utilizadores, ligações de proprietário e catálogo, e realizar testes funcionais antes de repetir em produção.

Usar o executor normal de migrations do TypeORM, que por omissão envolve as migrations numa transação (`all`). A migration não deve ser executada parcialmente ou como SQL avulso. Requer o schema inicial e rejeita tabelas de destino já existentes. Uma instalação vazia executa primeiro a migration inicial e depois esta.

## Nomes e preservação

As tabelas passam a `vc_users`, `vc_animals`, `vc_reservations`, `vc_blocked_times` e `vc_reset_tokens`; acrescentam-se `vc_species` e `vc_breeds`. Colunas usam snake_case e relações terminam em `_id`. O histórico de migrations do TypeORM é infraestrutura e não uma tabela de domínio.

As renomeações usam `sp_rename`, preservando registos, UUIDs e FKs existentes. Nomes históricos de constraints e índices existentes são conservados: não alteram os nomes das tabelas ou colunas. Consumidores externos, relatórios ou SQL avulso que usem nomes antigos precisam de atualização; `sp_rename` não reescreve esses consumidores.

`users.dateBirth` passa a `vc_users.birth_date`, mantendo texto e nulabilidade originais. Esta migration não tenta interpretar formatos de datas de utilizadores.

## Conversão dos animais

- `type`, `breed` e `age` passam a `legacy_type`, `legacy_breed` e `legacy_age`. Os valores originais permanecem integralmente disponíveis; os campos tornam-se opcionais para novos animais.
- `birth_date` começa em NULL. Uma idade não permite reconstruir uma data exata: não é fabricada nenhuma data nem uma idade histórica é tratada como idade atual.
- As espécies provêm de `legacy_type`. Espaços exteriores são removidos; tabulações e quebras de linha são substituídas por espaços nos nomes do catálogo. Texto original continua nos campos legados.
- Espécie vazia recebe o catálogo `Unknown`, incluindo se já existir uma espécie com esse nome equivalente pela collation. O campo legado permite distinguir os casos e corrigir depois.
- Raça vazia produz `breed_id = NULL`. A mesma raça textual em espécies diferentes cria entradas distintas, sem tentar adivinhar taxonomia ou corrigir inconsistências semânticas.
- Igualdade e deduplicação respeitam a collation da base de dados (incluindo sensibilidade a maiúsculas e acentos). Para variantes equivalentes, a representação escolhida é o mínimo binário determinístico. Não se fundem sinónimos como `cão` e `canino`, nem se interpreta raça `none` como ausente.
- `species_id` torna-se obrigatório após o preenchimento. A FK composta `(breed_id, species_id)` garante que a raça pertence à espécie; raça continua opcional.
- `weight` e `height` passam de int para decimal(13,3), preservando todo o intervalo int e permitindo três casas decimais. Não se convertem unidades, porque as unidades históricas não estão documentadas. Valores negativos legados são preservados e exigem revisão; não se acrescenta um CHECK que pudesse impedir a migração por dados antigos.
- `gender`, `image` e `confirmed` passam a `sex`, `image_url` e `is_verified`, sem reinterpretar o conteúdo. `image_url` pode ainda conter imagens legadas embutidas: a renomeação não faz upload nem transforma o conteúdo.
- `microchip_number` e `is_neutered` começam em NULL (desconhecidos), sem presumir ausência de esterilização nem unicidade de microchip.
- `created_at` e `updated_at` dos animais existentes indicam o momento da migração, pois não havia datas históricas. `deleted_at` começa em NULL.

## Reversão e limites de validação

`down` recusa uma reversão destrutiva: após novas escritas não é seguro descartar espécies, raças ou campos novos, nem truncar medidas decimais para inteiros. Preparar uma migration de reversão revista ou restaurar o backup, considerando escritas posteriores.

A compilação TypeScript não valida execução de DDL, permissões `ALTER`, locking, dados reais ou collation do servidor. A execução numa cópia SQL Server e a conferência dos dados continuam necessárias antes da produção.

## API e compatibilidade

As rotas existentes continuam dispon?veis. Os nomes f?sicos SQL usam snake_case; propriedades HTTP existentes de utilizadores/reservas mant?m camelCase. Animais aceitam speciesId e breedId; breedId:null limpa a ra?a. A esp?cie ? obrigat?ria. Alterar apenas a esp?cie preserva a ra?a atual e rejeita a opera??o se esta n?o pertencer ? nova esp?cie (enviar breedId:null ou uma ra?a v?lida).

GET /api/species e GET /api/breeds?speciesId=<uuid> requerem autentica??o. POST e PATCH nestes cat?logos requerem administrador. PATCH de ra?a altera apenas o nome, n?o transfere a ra?a de esp?cie. N?o h? seed universal: os cat?logos derivam dos dados antigos e podem ser geridos pelo administrador.

POST /api/animal/create e PATCH /api/animal/update/:id aceitam birthDate (YYYY-MM-DD, n?o futura), sex, imageUrl, microchipNumber e isNeutered; peso e altura aceitam at? tr?s casas decimais, com m?nimo zero. O estado verificado s? ? atribu?do pelo servidor/rota administrativa existente. Sexo conserva texto livre para n?o reinterpretar dados hist?ricos. A imagem continua nvarchar(max), incluindo URLs/data URLs hist?ricos.

Os aliases antigos type, breed, age, gender e image continuam aceites temporariamente. type/breed devem corresponder a entradas j? existentes nos cat?logos; n?o s?o criadas entradas automaticamente a partir de pedidos de clientes. N?o se transforma age em birthDate. As respostas do servi?o de animais conservam type, breed (string), age, gender, image e confirmed, acrescentando species, speciesId, breedId, breedDetails e os campos novos. age ? calculada quando birthDate ? conhecida; caso contr?rio corresponde a legacyAge (idade hist?rica sem data de refer?ncia).

A remo??o de animais passa a soft delete; listagens comuns omitem-nos. As listagens de reservas recuperam o animal apagado para preservar o hist?rico. Altera??es a reservas n?o carregam a rela??o animal se n?o a utilizam, evitando persistir NULL por causa do filtro de soft delete. legacy_* guarda a informa??o antiga; consultas diretas ? entidade (por exemplo atrav?s de reservas) exp?em a estrutura nova e devem ser revistas pelos consumidores.
