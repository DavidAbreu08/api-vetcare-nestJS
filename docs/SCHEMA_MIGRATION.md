# Schema SQL Server: atualiza??o incremental de medi??es

A migration `AnimalMeasurementsAndMetadata1794830400000` sucede ?s duas migrations existentes, que permanecem intactas. Nenhuma migration foi executada contra a base de dados. `synchronize` e `migrationsRun` continuam desativados.

## Aplica??o

Fazer backup e ensaiar o restauro. Parar escritas e executar `npm run db:migrate` numa c?pia representativa usando a transa??o padr?o TypeORM (`all`). Conferir contagens, rela??es, cat?logo e medidas antes da produ??o. N?o executar SQL parcial. A compila??o TypeScript n?o valida DDL, permiss?es, locking, collation ou os dados reais; ? necess?rio ensaio SQL Server.

## Metadados e nomes

Todas as tabelas de neg?cio, incluindo `vc_reset_tokens`, possuem `name`, `description` e `notes`; a tabela t?cnica de migrations fica exclu?da. Novos campos s?o opcionais: name nvarchar(255), description nvarchar(240), notes nvarchar(500). A descri??o j? existente dos animais conserva nvarchar(255), evitando truncar dados antigos. DTOs de cria??o/atualiza??o dos recursos aceitam os novos metadados; NULL limpa valores opcionais.

`vc_users.nome` j? ? renomeado para `name` pela migration anterior. A migration incremental reconhece esse estado e n?o duplica a coluna. IDs e FKs s?o preservados por `sp_rename`; SQL externo e relat?rios precisam de atualiza??o. A data de nascimento dos utilizadores continua texto, sem reinterpretar formatos.

## Animais e cat?logo

A migration anterior estrutura esp?cie e ra?a a partir dos textos antigos, respeitando a collation. Esp?cie vazia recebe Unknown, ra?a vazia recebe NULL. A FK composta mant?m coer?ncia entre ra?a e esp?cie. N?o se inferem sin?nimos nem datas de nascimento a partir de idades. O schema mant?m soft delete dos animais e as rela??es hist?ricas.

A migration incremental remove legacy_type, legacy_breed e legacy_age. Os textos originais e a idade hist?rica deixam de estar dispon?veis; o cat?logo estruturado permanece. Rever ou exportar esses valores antes da aplica??o se necess?rios para auditoria externa. sex, image_url e is_verified mant?m os valores anteriormente renomeados; n?o se transformam imagens embutidas ou URLs.

## Hist?rico de medi??es

`vc_animal_measurements` cont?m UUID, animal obrigat?rio, peso decimal(13,3) em kg, altura decimal(6,2), measured_at, utilizador autor, metadados e timestamps de auditoria. Pelo menos peso ou altura deve existir; valores negativos s?o rejeitados e zero ? aceite. FKs n?o fazem cascade delete do hist?rico.

Antes de alterar o schema, a migration rejeita valores legados negativos e alturas superiores a 9999.99 ou que precisariam de arredondamento a duas casas decimais. A opera??o falha com mensagem expl?cita. Corrigir conscientemente os dados e repetir a migration transacional; nunca arredonda ou limita valores silenciosamente.

Cada animal com algum valor existente gera uma linha antes de remover weight e height de vc_animals. O peso conserva decimal(13,3); n?o h? convers?o num?rica de unidades, pelo que ? necess?rio conferir a conven??o dos dados antigos. measured_at e user_id ficam NULL nas linhas importadas, pois o instante e autor s?o desconhecidos. Apenas created_at e updated_at recebem o instante da migra??o para auditoria. Novas escritas usam o autor autenticado e o instante fornecido ou preenchido pelo servi?o. Os ?ltimos peso e altura s?o consultados independentemente.

## Revers?o

down rejeita rollback destrutivo. Repor snapshots e apagar a tabela perderia o hist?rico; remover metadados perderia informa??o. Preparar uma migration inversa revista que preserve os dados ou restaurar o backup considerando escritas posteriores.

O driver usa useUTC:false e datetime2 conserva hora local sem offset. Aplicação e SQL Server devem usar a mesma timezone. Os defaults de auditoria de medições usam SYSDATETIME(), coerente com essa convenção.
