# Comandos de Voz — RotaLivre (`RL.voz`)

Documentação técnica da camada de dados e processamento de voz (`js/voz.js` e `js/geo.js`).

## Comandos Suportados (`pt-BR`)

| Categoria | Exemplos de Frases | Intenção | Parâmetros |
| :--- | :--- | :--- | :--- |
| **Perfil** | *"Perfil cego"*, *"Perfil cadeirante"* | `PERFIL` | `perfil`: `'cego'` \| `'cadeirante'` |
| **Destino Falado** | *"Ir para Paulista"*, *"Rota para Estação da Sé"* | `NAVEGAR_DESTINO` | `destinoTexto`, `lugar` (`{ nome, lat, lon }`) |
| **Navegação ao Vivo** | *"Iniciar navegação"*, *"Pausar"*, *"Encerrar"*, *"Próximo passo"* | `INICIAR_NAVEGACAO`, `PAUSAR_NAVEGACAO`, `ENCERRAR_NAVEGACAO`, `PROXIMO_PASSO` | — |
| **Reportar (156)** | *"Reportar falta de rampa aqui"*, *"Calçada quebrada"*, *"Piso tátil interrompido"* | `REPORTAR_BARREIRA` | `tipoBarreira`, `usarAqui`, `lugar` |
| **Apoio Comunitário** | *"Chamar voluntário"*, *"Pedir apoio"* | `CHAMAR_VOLUNTARIO` | — |
| **Acessibilidade** | *"Alto contraste"*, *"Aumentar fonte"*, *"Onde estou?"* | `ALTERNAR_CONTRASTE`, `ALTERNAR_FONTE`, `ONDE_ESTOU` | `lugar` (em `ONDE_ESTOU`) |
| **Ajuda** | *"O que posso dizer?"*, *"Comandos"* | `AJUDA_COMANDOS` | — |
| **SOS (2 etapas)** | 1º: *"Socorro"* / *"Emergência"*<br>2º: *"Confirmar"* ou *"Cancelar"* | `SOS_PENDENTE` → `SOS_CONFIRMADO` / `SOS_CANCELADO` | Janela de confirmação de 15s |

## Como Rodar os Testes

```bash
node --test tests/voz.test.js