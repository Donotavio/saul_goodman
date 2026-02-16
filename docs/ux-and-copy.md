# UX, tom de voz e microcopy

Este guia garante consistência de linguagem e experiência entre popup, options e relatório.

## Identidade

- **Saul Goodman** como advogado-vendedor carismático, tom sarcástico e persuasivo.
- Evite referências diretas a episódios, imagens ou marcas protegidas.
- Mensagens curtas, claras e sempre informando o que é rastreado.

## Idiomas e i18n

- Idiomas suportados seguem `src/shared/i18n.ts`.
- Toda string visível deve usar chaves i18n.
- RTL automático para `ar` e `ur`.

## Popup

Elementos-chave que devem manter consistência de copy:

- **Badge do índice**: score + mensagem contextual (faixas 0–25, 26–50, 51–75, 76–100).
- **Sugestões automáticas**: domínio, classificação, confiança e botões de ação.
- **Justiça do dia**: toggle “Ignorar hoje” + seletor de contexto.
- **Resumo diário**: produtivo, procrastinação e inatividade.
- **KPIs**: foco ativo, trocas/h, tempo ocioso, Prod x Proc, campeões/vilões.
- **Exportações**: CSV, PDF e relatório detalhado.
- **Modo crítico**: overlay e sirene quando o score ultrapassa o limiar configurado.
- **Blog**: recomendação de artigo baseada no contexto do dia.

### Explicações de recomendação (popup/report/options)

- Padronizar frases no formato: **sinal identificado + efeito no veredito**.
- Tom Saul moderado: linguagem natural, direta e com ironia leve.
- Evitar jargão cru de feature (`flag:*`, `host:*`, etc.) no texto principal.
- Quando houver detalhe técnico, manter discreto entre parênteses.
- Direções padronizadas:
  - `productive` => “puxa para produtivo”
  - `procrastination` => “tem cheiro de procrastinação”
- Frases devem ser curtas e legíveis para usuário não técnico.

## Options

- Mensagens devem reforçar que tudo é local.
- Pesos precisam somar 1; feedback imediato ao usuário.
- Domínios produtivos/procrastinatórios têm confirmação visual de alterações.
- Bloqueio local deve deixar claro que é reversível e não envia dados.
- Seções: pesos/limiares, domínios, modo crítico, auto‑classificação, horário de trabalho, feriados, integração VS Code.

## Relatório

- Mostra índice, gráficos por hora, trocas de abas, ranking de domínios e narrativa.
- Contexto e justiça do dia aparecem no banner superior.
- Painel VS Code aparece apenas quando integração está ativa.

## Acessibilidade e UI

- Texto mínimo de 0.9rem.
- Tooltips com `data-tooltip` e `aria-label`.
- Botões com estados de foco e contraste adequado.
