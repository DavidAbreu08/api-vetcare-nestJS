# Respostas HTTP e tratamento global de erros

`HttpResponseModule`, importado pelo `AppModule`, regista o interceptor de sucesso e o filtro de exceções para todos os controllers. Não é preciso adicioná-los a cada endpoint.

```ts
interface HttpResponse<T = unknown> {
  status: HttpStatus;
  friendlyMessage: string;
  success: boolean;
  result: T | null;
  errorMetadata?: ErrorMetadata;
}
```

O estado do corpo coincide com o estado HTTP real. Sucessos omitem `errorMetadata`; erros têm `result: null`. Headers continuam nos headers HTTP. Não se inclui request nem timestamp.

## Erros de domínio

O enum `ErrorMetadata` é global. As mensagens continuam a pertencer ao domínio e conservam o idioma atual; esta alteração não traduz todas as mensagens existentes.

```ts
throw applicationError(
  ErrorMetadata.NOT_FOUND,
  MeasurementErrorMessages[ErrorMetadata.NOT_FOUND],
);
```

`applicationError` preserva as subclasses do Nest (`NotFoundException`, `ConflictException`, etc.), necessárias aos catches e testes existentes. Quando a categoria não chega para descrever uma regra, fornece-se uma mensagem específica do domínio. Não se faz try/catch só para voltar a lançar o mesmo erro.

As mensagens fornecidas a `applicationError` e `ApplicationException` são explicitamente públicas, incluindo falhas 5xx: devem ser frases seguras do domínio, nunca mensagens de drivers. O filtro oculta por defeito mensagens de outras exceções 5xx e erros desconhecidos. A causa opcional nunca é serializada. Os logs globais registam o tipo e as localizações da stack sem mensagens SQL ou parâmetros.

As exceções Nest existentes continuam suportadas: a categoria é inferida do estado HTTP quando não foi declarada. Arrays de mensagens da validação são unidos por `; ` em `friendlyMessage`; não existe um mapa estruturado de erros por campo neste contrato.

`PersistenceService.translate` concentra a tradução de SQL Server, tanto em `execute` como no filtro global. Não existe um segundo filtro a enviar respostas de persistência separadamente.

## Sucessos

O serviço devolve dados e o interceptor coloca-os em `result`. A mensagem por defeito é `Operação concluída com sucesso.`. Para uma mensagem própria:

```ts
@ResponseMessage('Medição criada com sucesso.')
@Post()
create(@Body() dto: CreateMeasurementDto) {
  return this.service.create(dto);
}
```

O decorator pode receber uma constante de mensagens e pode ser aplicado ao controller inteiro. Não se deve devolver manualmente um `HttpResponse` já formatado: o interceptor é o dono do envelope.

Os serviços existentes foram migrados para devolver dados ou `null`, sem `{ statusCode, message }`. As mensagens de confirmação estão nos decorators dos controllers. O interceptor não tenta reconhecer envelopes antigos: qualquer objeto devolvido é dado da operação. Usar `@HttpCode` quando for necessário definir o estado da operação.

Objetos de negócio com `message` e outros campos, sem `statusCode`, são preservados como dados. A serialização existente continua a excluir campos privados antes do envelope. Respostas 204/304/HEAD não recebem corpo e `StreamableFile` mantém o fluxo original.

## Impacto no frontend

- Dados anteriormente na raiz passam para `result`: por exemplo `response.token` passa a `response.result.token`.
- `message` público passa a `friendlyMessage`; `statusCode` passa a `status`.
- Códigos específicos antigos (`EMPLOYEE_UNAVAILABLE`, `INVALID_TRANSITION`, etc.) passam a categorias genéricas, normalmente `CONFLICT` ou `INVALID_VALUE`.
- Detalhes adicionais de conflitos (IDs, contagens e outros campos) não integram a resposta de erro. Podem continuar disponíveis internamente para regras e diagnóstico, mas o filtro emite apenas o contrato acordado.
- A documentação Swagger apresenta o envelope global.

O filtro trata pedidos HTTP. Falhas de arranque, migrations e tarefas em background precisam de logs e tratamento próprios. Respostas enviadas diretamente com `res.json()` não passam pela transformação de sucesso; os controllers devem devolver dados ao Nest. O middleware JWT existente foi adaptado para lançar exceções.

## Validação

Os testes de integração de `http-response.module.spec.ts` exercitam o módulo real sem base de dados: validação, guards, estados, SQL, rotas inexistentes e falhas inesperadas. Os testes do interceptor verificam serialização, mensagens explícitas, listas, ficheiros e ausência de corpo. A suite de domínio verifica a compatibilidade das exceções. As convenções para alterações futuras estão em `AGENTS.md` na raiz do projeto.
