# RotaLivre – CitizenTech Urbano

**Global Solution 2026.2 – Bacharelado em Ciência da Computação (FIAP)**  
**Disciplina:** Software Engineering  
**Integrantes:** Natalia Alcantara (RM 568570) e Raissa Marinho (RM 568301)  
**Link do Mapa Mental (Miro):** `[Inserir link público do board do Miro aqui]`

---

## 🗺️ Protótipo interativo — Mapa Colaborativo

Além dos mapas mentais, este repositório traz um **protótipo funcional** (`index.html`): um mapa colaborativo de acessibilidade, no estilo **Waze**, onde o cidadão **registra barreiras urbanas** (buracos, falta de rampa, piso tátil interrompido, obras) e **pontos de apoio** (voluntários e postos), cada um com a sua **circunstância** (descrição + gravidade).

- **Acesse online:** https://codebynaty.github.io/rotalivre-citizentech/
- **Rodar local:** abra o `index.html` em qualquer navegador.
- **Tecnologia:** [Leaflet](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org) (mapa); relatos salvos no próprio navegador (demonstração). Interface acessível (alvos de toque grandes, alto contraste, rótulos ARIA).

---

## 1. Visão Geral do Problema e da Solução

O ambiente urbano contemporâneo apresenta severas barreiras de acessibilidade para pessoas cegas, com baixa visão e cadeirantes. A escassez de dados atualizados sobre o estado real das calçadas, a interrupção frequente do piso tátil, a falta de rampas de acesso ou a presença de inclinações inadequadas, aliadas a obras e obstruções temporárias, transformam pequenos deslocamentos diários em rotas de alto risco.

O **RotaLivre** é uma plataforma CitizenTech integrada que resolve essa lacuna por meio de três pilares fundamentais:
1. **Roteamento Inteligente e Personalizado:** Algoritmos de navegação que consideram parâmetros específicos de acessibilidade (inclinação, piso tátil, largura e qualidade do pavimento) de acordo com o perfil de mobilidade do usuário.
2. **Mapeamento Colaborativo Validado por IA:** Coleta contínua de dados pela comunidade, processada por modelos de visão computacional que identificam e categorizam barreiras urbanas em tempo real.
3. **Rede Humana e Conexão Pública:** Integração direta entre cidadãos, voluntários verificados e postos de apoio da Prefeitura para acompanhamento presencial em trechos de alta complexidade e abertura automatizada de chamados de zeladoria.

---

## 2. Mapa Mental 1 – Arquitetura Geral do Sistema

### 2.1 Sensores e Entrada de Dados
* **GPS de Alta Precisão, Bússola e Giroscópio:** Captura de orientação espacial detalhada para orientação passo a passo voltada a pessoas cegas.
* **Microfone e Reconhecimento de Voz:** Interface *hands-free* para emissão de comandos de navegação e relato verbal de incidentes urbanos.
* **Câmera do Smartphone:** Registro fotográfico de obstáculos, buracos, degradação de calçadas e ausência de rampas.
* **Beacons Bluetooth e Sensores IoT Urbanos:** Dispositivos instalados em terminais de ônibus, estações de metrô e postos públicos para micro-localização.

### 2.2 Front-end
* **App Mobile Acessível:** React Native / Flutter com suporte nativo a TalkBack e VoiceOver, alto contraste e navegação guiada por voz (*Voice-First*).
* **Painel Web (Prefeitura e Postos de Apoio):** Portal de gestão operacional para acompanhamento de chamados de zeladoria urbana e coordenação de agentes públicos e voluntários.

### 2.3 Back-end
* **API Gateway & Core:** FastAPI / Spring Boot gerenciando rotas RESTful e autenticação.
* **Motor de Roteamento Acessível:** Algoritmo de grafos multicritério (A*/Dijkstra ponderado) com pesos dinâmicos para piso tátil, rampas, inclinação e largura de calçada.
* **Serviço de Matching e Acompanhamento:** Pareamento em tempo real entre cidadão, voluntário verificado e posto público mais próximo.

### 2.4 Banco de Dados
* **PostgreSQL + PostGIS:** Armazenamento geoespacial de trechos de calçadas, rampas e obstáculos.
* **Redis:** Cache de alta velocidade para rotas ativas e geolocalização de voluntários/postos.
* **SQLite Local:** Armazenamento offline nos dispositivos móveis para trechos com oscilação de sinal.

### 2.5 Inteligência Artificial e Machine Learning
* **Visão Computacional:** Análise automática de fotos enviadas pelos usuários para classificar tipo e gravidade da obstrução (buracos, degraus, veículos sobre a calçada).
* **Modelo de Risco e Priorização de Rota:** Ajuste dinâmico de trajetos conforme o perfil cadastrado (deficiência visual ou cadeirante).

### 2.6 APIs Externas
* **OpenStreetMap / Google Maps API:** Base cartográfica urbana.
* **API Prefeitura / Portal 156:** Abertura automatizada de chamados de manutenção e integração com CRAS e Subprefeituras.
* **Gov.br / Validação de Identidade:** Verificação oficial de identidade e antecedentes para cadastro seguro de voluntários.
* **Twilio / Push Notifications:** Alertas sonoros, SMS e notificações push de chegada do acompanhante.

### 2.7 Serviços em Nuvem (AWS Cloud)
* **AWS EC2 / ECS:** Hospedagem do back-end, motor de grafos e serviços de integração.
* **AWS S3:** Armazenamento seguro de imagens de ocorrências urbanas e documentos de verificação.

### 2.8 Sistema de Alertas
* **Alertas Sonoros e Hápticos:** Padrões de vibração e avisos de áudio indicando término de piso tátil, início de obras ou aproximação de rampas.
* **Notificação de Pareamento e Botão SOS:** Avisos em tempo real sobre a chegada do voluntário/agente e botão de emergência conectado aos postos municipais.

---

## 3. Mapa Mental 2 – Divisão das Áreas Funcionais

| Área Funcional | Função | Desenvolvimento | Objetivo |
| :--- | :--- | :--- | :--- |
| **1. Coleta de Dados e Identificação** | Captar condições reais de acessibilidade (piso tátil, rampas, buracos) e necessidades do usuário. | Interface *Voice-First* no app mobile, mapeamento colaborativo (foto/voz) e sensores do dispositivo. | Mapear a acessibilidade real rua a rua, preenchendo lacunas de mapas convencionais. |
| **2. Processamento e Análise de Dados** | Consolidar dados geoespaciais, validar relatos da comunidade e pontuar a qualidade de cada trecho. | Pipeline geoespacial em Python (GeoPandas) e queries espaciais em PostgreSQL/PostGIS. | Converter relatos individuais em uma malha viária acessível atualizada dinamicamente. |
| **3. Inteligência Artificial e ML** | Calcular rotas personalizadas e validar imagens de obstáculos urbanos automaticamente. | Grafos multicritério (A* ponderado) e modelo de Visão Computacional para detecção de obstruções. | Assegurar trajetos sem degraus/inclinações para cadeirantes e com trilha tátil para cegos. |
| **4. Alertas e Notificações** | Guiar o usuário em tempo real durante o percurso e gerenciar pontos de encontro. | Motor de áudio-orientação (TTS), feedback háptico (vibração) e serviço de push notifications. | Promover a autonomia e segurança do cidadão ao longo de todo o deslocamento. |
| **5. Dashboards e Visualização** | Exibir dados de acessibilidade para a comunidade e gerar relatórios analíticos para a gestão pública. | Histórico de rotas no aplicativo e painel analítico em Power BI com mapas de calor de criticidade. | Oferecer transparência sobre a infraestrutura e embasar decisões de investimentos públicos. |
| **6. Gerenciamento de Demandas** | Orquestrar pedidos de apoio presencial e gerenciar a rede de voluntários e postos municipais. | Algoritmo de matching por geolocalização, validação por código/voz e sistema de avaliação mútua. | Conectar cidadãos que necessitam de apoio a acompanhantes verificados e postos públicos. |
| **7. Integração de Sistemas** | Conectar a plataforma aos serviços públicos municipais, transporte e bases cartográficas. | API Gateway RESTful integrado ao OpenStreetMap, Portal 156 e equipamentos de assistência (CRAS). | Converter os obstáculos reportados no app em chamados diretos de zeladoria urbana. |
| **8. Acessibilidade, Privacidade e Segurança** | Assegurar o uso universal da aplicação e resguardar dados pessoais e de geolocalização. | Conformidade WCAG 2.1 AA, leitura de tela (TalkBack/VoiceOver), autenticação Gov.br e LGPD. | Garantir inclusão digital plena e total proteção de dados e integridade aos usuários. |

---

## 4. Alinhamento com os ODS (ONU)
* **ODS 10 – Redução das Desigualdades:** Promove a inclusão social e a autonomia de pessoas com deficiência física ou visual.
* **ODS 11 – Cidades e Comunidades Sustentáveis:** Apoia o planejamento urbano inclusivo e o acesso seguro a espaços e transportes públicos.
