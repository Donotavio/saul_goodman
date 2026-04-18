---
globs: "src/popup/**, src/options/**, src/report/**, src/block/**, src/shared/**, site/**, vscode-extension/src/reports/**, vscode-extension/src/ui/**"
---

# Saul Goodman Branding & Design System

## Color Tokens

### Primary Palette

| Token | Hex | Uso |
|-------|-----|-----|
| saul-yellow | `#ffe680` | Acento primario, gradientes, highlights, popup gradient start |
| saul-gold | `#ffd166` | Sombras de card, focus rings, botoes secundarios |
| saul-cream | `#fff3c4` | Fundos leves, popup gradient mid |
| saul-bg | `#fdf3c1` | Background base options/report |
| saul-warm-bg | `#fffdf5` | Background site/blog |
| saul-light | `#fff6cc` | VS Code report light gradient |
| saul-shadow | `#d7b247` | Cor principal de sombras hard-edge |
| saul-black | `#111` | Bordas, texto primario em superficies claras |
| saul-text | `#1b120a` | Texto corpo (marrom quente) |
| saul-brown | `#2b1a11` | Texto site, headings |

### Accent / Semantic

| Token | Hex | Uso |
|-------|-----|-----|
| saul-red | `#7a0500` | Vermelho profundo, site CTA, promise text |
| saul-danger | `#d62828` | Erro, KPIs de procrastinacao, alertas criticos |
| saul-danger-dark | `#d00000` | Status procrastinacao no report |
| saul-success | `#32c36b` | Verde, KPIs produtivos |
| saul-success-dark | `#0a7e07` | Status produtivo forte |
| saul-neutral | `#555` | Texto neutro, status indefinido |
| saul-ai-purple | `#8b5cf6` | Features AI (VS Code) |

### Context Colors (fixos — nunca alterar)

| Context | Hex |
|---------|-----|
| Work | `#d8a51a` |
| Personal | `#8a6fe8` |
| Leisure | `#36a45b` |
| Study | `#2e6fb2` |
| DayOff | `#c98a4c` |
| Vacation | `#2b93c7` |

### Block Page (Dark Mode)

| Token | Hex | Uso |
|-------|-----|-----|
| block-bg | `#111` | Background da pagina |
| block-card-bg | `#1a1a1a` | Card background |
| block-accent | `#ffe434` | Amarelo vibrante sobre fundo escuro |
| block-text-muted | `#f8e7a1` | Texto secundario |
| block-btn-secondary-bg | `#2a2a2a` | Botao secundario |

### Combo Toast (VS Code)

| Token | Hex | Uso |
|-------|-----|-----|
| combo-color | `#FFC857` | Borda, progress bar, titulo glow |
| ultra-gold | `#FFD700` | Ultra combo gold |
| ultra-orange | `#FFA500` | Ultra combo secundario |

## Typography

| Papel | Fonte | Pesos | Contexto |
|-------|-------|-------|----------|
| Body | Inter | 400, 600, 700, 800 | Todas as superficies |
| Display | Archivo Black | 400 | Headings do site, nav brand |
| System | -apple-system, system-ui stack | — | Combo toast (VS Code overlay) |

### Regras

- Font size minimo: `0.9rem` (acessibilidade)
- KPI values: weight 800-900, tamanho 1.8-2.5rem
- Labels/eyebrows: uppercase, letter-spacing 0.05-0.16em, 0.65-0.75rem
- Headings: weight 700-900
- Nunca misturar font stacks na mesma superficie

## Design Language

### Bordas

- Primaria: `2-3px solid #111`
- Secundaria/dashed: `2px dashed #111` (suggestion cards, divisores)
- Block page: `2px solid #ffe434`
- Inputs: `2px solid #111`

### Sombras

- Card padrao: `4px 4px 0 <shadow-color>`
- Hero/header: `6px 6px 0 <shadow-color>`
- Blog hero: `12px 12px 0 #111`
- Botao: `3px 3px 0 <shadow-color>`
- **Superficies claras**: somente hard-edge (sem blur)
- **Superficies dark** (block, toast): soft shadows permitidos para profundidade

### Border Radius

- Cards: 12-16px
- Botoes: 8-10px
- Inputs: 8px
- Badges/logos: 50% (circular)
- Pills: 999px

### Hover & Interacao

- Cards: `translateY(-2px)` + sombra cresce +2px
- Botoes: `translateY(-1px)` + sombra cresce
- Active/pressed: `translateY(1px)` + sombra diminui
- Transicoes: `0.15-0.2s ease`

### Padroes Especiais

- Dashed inner border: `::after` com `inset 10-12px`, `1px dashed rgba(...)`
- Rotacoes em badges/logos no hover: `-2deg` a `-5deg`
- Background gradients: `linear-gradient(120deg-135deg)` amarelo → cream → branco
- Heading underline: `::after` com `50% width`, gradiente dourado
- Confetti/glitch em estados de celebracao

## Component Patterns

### Card

```
background: white
border: 2px solid #111
border-radius: 14-16px
box-shadow: 4px 4px 0 saul-gold
padding: 16-20px
```

### Button Primary

```
background: #111
color: #ffe680
border: 2px solid #111
border-radius: 8px
box-shadow: 3px 3px 0 saul-gold
font-weight: 700
```

### Button Ghost

```
background: transparent
color: #111
border: 2px solid #111
border-radius: 8px
box-shadow: 2px 2px 0 saul-shadow
```

### Button Block Page (dark)

```
Primary: background #ffe434, color #111
Secondary: background #2a2a2a, color #ffe434, border 1px solid #ffe434
```

### KPI Card

```
background: white
border: 2px solid <cor-semantica>
box-shadow: 3px 3px 0 <cor-semantica-clara>
Label: 0.7rem uppercase, letter-spacing 0.5px
Value: 1.8rem weight 800
```

### Input

```
background: white
border: 2px solid #111
border-radius: 8px
padding: 10-12px
Focus: border-color saul-gold, box-shadow 0 0 0 3px rgba(255,209,102,0.2)
```

### Badge/Tag

```
display: inline-block
padding: 2-4px 8-12px
border-radius: 999px
font-size: 0.7-0.75rem
font-weight: 700
text-transform: uppercase
letter-spacing: 0.05em
```

## Tone & Copy

### Persona

Saul Goodman como advogado defensor contra procrastinacao. Tom carismático, sarcastico com ironia moderada.

### Regras de voz

- Linguagem de tribunal: caso, julgamento, defender, veredito, evidencia
- Direcoes padronizadas: "puxa para produtivo" / "tem cheiro de procrastinacao"
- Frases curtas, legiveis para usuario nao tecnico
- Detalhes tecnicos entre parenteses quando necessario
- Privacidade sempre enfatizada: "nada sai do seu navegador"
- Sem referencias diretas a episodios, imagens ou marcas protegidas

### i18n

- Toda string visivel DEVE usar chave i18n
- RTL automatico para `ar` e `ur`
- 14 locales sincronizados
- Manter consistencia de tom entre locales

## Surfaces Reference

| Superficie | Largura | Background | Dark? | Vars CSS | Status |
|-----------|---------|-----------|-------|----------|--------|
| Popup | 360px | radial-gradient yellow→cream→white | Nao | `--saul-*` (56 tokens) | OK |
| Options | max 1200px | `#fdf3c1` | Nao | `--saul-*` (59 tokens) | OK |
| Report Chrome | max 1200px | `#fdf3c1` | Nao | `--saul-*` (130+ tokens) | OK |
| Block | fullscreen | `#111` | Sim | `--block-*` (block.css) | OK |
| Site | fluid | `#fffdf5` | Nao | `--yellow`, `--gold` etc. | Parcial |
| Blog | max 1200px | `#fffdf5` | Nao | Herda do site | Parcial |
| VS Code Report | webview | `#1e1e1e` | Sim | `--saul-*` | OK |
| VS Code Toast | overlay | transparente | Sim | `--combo-color` | OK |

## Design Debt Conhecida

- ~~Chrome extension (popup, options, report): zero CSS custom properties, 55+ hex hardcoded~~ RESOLVIDO
- ~~Block page: todos os estilos inline no HTML, sem arquivo CSS externo~~ RESOLVIDO
- Site usa nomes diferentes do VS Code (`--yellow` vs `--saul-yellow`)
- ~~Font-family declarada redundantemente em cada arquivo CSS (`*` selector)~~ RESOLVIDO
- Nenhum stylesheet compartilhado existe entre superficies Chrome
- ~~VS Code report.css declara font-family duas vezes (Inter + system stack)~~ RESOLVIDO
