/**
 * Base curada do catálogo: matérias da escola (BNCC), conteúdos de vestibular/ENEM (matriz de
 * referência do ENEM) e disciplinas comuns de faculdade, por curso. Cada tema pertence a uma
 * grande área (CAPES/CNPq) e pode estar em mais de um nível. O catálogo continua crescendo pela
 * comunidade (termos usados por várias pessoas viram temas oficiais).
 */
export const CATALOG_LEVELS = ["escola", "vestibular", "faculdade"] as const;
export type CatalogLevel = (typeof CATALOG_LEVELS)[number];

type Group = { area: string; levels: CatalogLevel[]; course?: string; topics: string[] };

const EV: CatalogLevel[] = ["escola", "vestibular"];
const EVF: CatalogLevel[] = ["escola", "vestibular", "faculdade"];
const V: CatalogLevel[] = ["vestibular"];
const F: CatalogLevel[] = ["faculdade"];

export const CATALOG_SEED: Group[] = [
  // ---------------------------------------------------------------- Escola + vestibular (disciplinas)
  { area: "exatas", levels: EVF, topics: ["Matemática", "Física", "Química"] },
  { area: "biologicas", levels: EVF, topics: ["Biologia"] },
  { area: "biologicas", levels: ["escola"], topics: ["Ciências"] },
  { area: "humanas", levels: EVF, topics: ["História", "Geografia", "Filosofia", "Sociologia"] },
  { area: "humanas", levels: ["escola"], topics: ["Ensino Religioso"] },
  { area: "letras_artes", levels: EVF, topics: ["Língua Portuguesa", "Literatura"] },
  { area: "letras_artes", levels: EV, topics: ["Redação", "Gramática", "Interpretação de Texto", "Produção de Texto"] },
  { area: "letras_artes", levels: ["escola"], topics: ["Artes"] },
  { area: "saude", levels: ["escola"], topics: ["Educação Física"] },
  { area: "preparatorios", levels: EV, topics: ["Inglês", "Espanhol"] },

  // ---------------------------------------------------------------- Vestibular / ENEM — Matemática
  {
    area: "exatas",
    levels: EV,
    topics: [
      "Porcentagem", "Razão e Proporção", "Regra de Três", "Equações do 1º e 2º Grau", "Funções",
      "Função Afim", "Função Quadrática", "Função Exponencial", "Logaritmos", "Progressão Aritmética",
      "Progressão Geométrica", "Matrizes e Determinantes", "Sistemas Lineares", "Análise Combinatória",
      "Probabilidade", "Estatística Básica", "Geometria Plana", "Geometria Espacial", "Geometria Analítica",
      "Trigonometria", "Números Complexos", "Polinômios", "Matemática Financeira", "Conjuntos",
    ],
  },
  // Física
  {
    area: "exatas",
    levels: EV,
    topics: [
      "Cinemática", "Leis de Newton", "Trabalho e Energia", "Quantidade de Movimento", "Gravitação",
      "Hidrostática", "Termologia", "Calorimetria", "Óptica", "Ondulatória", "Eletrostática",
      "Eletrodinâmica", "Física Moderna",
    ],
  },
  { area: "exatas", levels: EVF, topics: ["Termodinâmica", "Eletromagnetismo"] },
  // Química
  {
    area: "exatas",
    levels: EV,
    topics: [
      "Atomística", "Tabela Periódica", "Ligações Químicas", "Funções Inorgânicas", "Estequiometria",
      "Soluções", "Termoquímica", "Cinética Química", "Equilíbrio Químico", "Eletroquímica", "Isomeria",
      "Reações Orgânicas", "Radioatividade", "Química Ambiental",
    ],
  },
  { area: "exatas", levels: EVF, topics: ["Química Orgânica"] },
  // Biologia
  {
    area: "biologicas",
    levels: EV,
    topics: ["Citologia", "Evolução", "Fisiologia Humana", "Biotecnologia", "Seres Vivos e Classificação"],
  },
  { area: "biologicas", levels: EVF, topics: ["Genética", "Ecologia", "Botânica", "Zoologia", "Bioquímica", "Histologia", "Embriologia", "Microbiologia"] },
  // História
  {
    area: "humanas",
    levels: EV,
    topics: [
      "História do Brasil", "História Geral", "Brasil Colônia", "Brasil Império", "Brasil República",
      "Era Vargas", "Ditadura Militar", "Antiguidade Clássica", "Idade Média", "Iluminismo",
      "Revolução Francesa", "Revolução Industrial", "Primeira Guerra Mundial", "Segunda Guerra Mundial",
      "Guerra Fria",
    ],
  },
  // Geografia, Filosofia, Sociologia
  {
    area: "humanas",
    levels: EV,
    topics: [
      "Cartografia", "Geografia do Brasil", "Geografia Física", "Geografia Humana", "Geopolítica",
      "Globalização", "Urbanização", "Climatologia", "Questões Ambientais", "Filosofia Antiga",
      "Ética", "Filosofia Política", "Cidadania e Direitos Humanos", "Movimentos Sociais",
    ],
  },
  // Linguagens
  {
    area: "letras_artes",
    levels: EV,
    topics: [
      "Gêneros Textuais", "Figuras de Linguagem", "Funções da Linguagem", "Variação Linguística",
      "Movimentos Literários", "Literatura Brasileira",
    ],
  },
  { area: "preparatorios", levels: V, topics: ["ENEM", "Vestibular", "Redação ENEM", "Simulados", "Atualidades"] },

  // ---------------------------------------------------------------- Faculdade — Medicina e saúde
  {
    area: "saude",
    levels: F,
    course: "Medicina",
    topics: [
      "Anatomia", "Anatomia Humana", "Fisiologia", "Farmacologia", "Patologia", "Semiologia",
      "Clínica Médica", "Cirurgia", "Pediatria", "Ginecologia e Obstetrícia", "Cardiologia",
      "Neurologia", "Psiquiatria", "Infectologia", "Medicina de Família e Comunidade", "Radiologia",
      "Ortopedia", "Dermatologia", "Oftalmologia", "Urgência e Emergência", "Epidemiologia",
      "Bioestatística", "Saúde Pública", "Genética Médica",
    ],
  },
  { area: "biologicas", levels: F, course: "Medicina", topics: ["Imunologia", "Parasitologia", "Biologia Molecular", "Biofísica"] },
  { area: "saude", levels: F, course: "Enfermagem", topics: ["Enfermagem", "Fundamentos de Enfermagem", "Enfermagem em Saúde Coletiva", "Saúde da Mulher", "Saúde da Criança"] },
  { area: "saude", levels: F, course: "Odontologia", topics: ["Odontologia", "Dentística", "Periodontia", "Endodontia", "Prótese Dentária", "Ortodontia", "Cirurgia Bucomaxilofacial"] },
  { area: "saude", levels: F, course: "Fisioterapia", topics: ["Fisioterapia", "Cinesiologia", "Biomecânica", "Fisioterapia Respiratória", "Reabilitação"] },
  { area: "saude", levels: F, course: "Nutrição", topics: ["Nutrição", "Nutrição Clínica", "Bromatologia", "Dietoterapia", "Avaliação Nutricional"] },
  { area: "saude", levels: F, course: "Farmácia", topics: ["Farmácia", "Farmacognosia", "Química Farmacêutica", "Farmacotécnica", "Toxicologia"] },
  { area: "saude", levels: F, course: "Educação Física", topics: ["Fisiologia do Exercício", "Treinamento Esportivo", "Educação Física Escolar"] },

  // ---------------------------------------------------------------- Ciências Biológicas
  { area: "biologicas", levels: F, course: "Ciências Biológicas", topics: ["Biologia Celular", "Biologia Marinha", "Paleontologia", "Bioinformática"] },

  // ---------------------------------------------------------------- Exatas e computação
  {
    area: "exatas",
    levels: F,
    course: "Matemática",
    topics: ["Cálculo", "Cálculo I", "Cálculo II", "Cálculo III", "Álgebra Linear", "Equações Diferenciais", "Cálculo Numérico", "Análise Real", "Álgebra Abstrata", "Matemática Discreta", "Estatística", "Probabilidade e Estatística"],
  },
  { area: "exatas", levels: F, course: "Física", topics: ["Física Geral", "Mecânica Clássica", "Mecânica Quântica", "Física Estatística", "Astronomia"] },
  { area: "exatas", levels: F, course: "Química", topics: ["Química Geral", "Química Analítica", "Química Inorgânica", "Físico-Química"] },
  { area: "exatas", levels: F, course: "Geociências", topics: ["Geologia", "Oceanografia", "Meteorologia"] },
  {
    area: "exatas",
    levels: F,
    course: "Ciência da Computação",
    topics: [
      "Ciência da Computação", "Programação", "Algoritmos", "Estrutura de Dados", "Banco de Dados",
      "Programação Orientada a Objetos", "Engenharia de Software", "Redes de Computadores",
      "Sistemas Operacionais", "Arquitetura de Computadores", "Teoria da Computação", "Compiladores",
      "Sistemas Distribuídos", "Computação Gráfica", "Programação Web", "Desenvolvimento Mobile",
      "Segurança da Informação", "Inteligência Artificial", "Aprendizado de Máquina", "Ciência de Dados",
      "Computação em Nuvem", "DevOps",
    ],
  },
  // CNPq 1.03.03.04: Sistemas de Informação é subárea de Ciência da Computação (Exatas e da Terra).
  {
    area: "exatas",
    levels: F,
    course: "Sistemas de Informação",
    topics: [
      "Sistemas de Informação", "Programação", "Banco de Dados", "Engenharia de Software",
      "Redes de Computadores", "Segurança da Informação",
    ],
  },

  // ---------------------------------------------------------------- Engenharias
  {
    area: "engenharias",
    levels: F,
    course: "Engenharia",
    topics: [
      "Engenharia Civil", "Engenharia Elétrica", "Engenharia Mecânica", "Engenharia de Produção",
      "Engenharia Química", "Engenharia Ambiental", "Engenharia de Computação", "Desenho Técnico",
      "Mecânica dos Sólidos", "Resistência dos Materiais", "Mecânica dos Fluidos", "Fenômenos de Transporte",
      "Ciência dos Materiais", "Circuitos Elétricos", "Eletrônica Analógica", "Eletrônica Digital",
      "Sistemas de Controle", "Máquinas Elétricas", "Estruturas de Concreto", "Topografia", "Hidráulica",
      "Geotecnia", "Materiais de Construção", "Processos de Fabricação", "Pesquisa Operacional",
      "Engenharia Econômica",
    ],
  },

  // ---------------------------------------------------------------- Agrárias e veterinária
  { area: "agrarias", levels: F, course: "Agronomia", topics: ["Agronomia", "Ciência do Solo", "Fitotecnia", "Fitopatologia", "Irrigação e Drenagem", "Engenharia Florestal"] },
  { area: "agrarias", levels: F, course: "Medicina Veterinária", topics: ["Medicina Veterinária", "Anatomia Veterinária", "Clínica Veterinária", "Zootecnia"] },
  { area: "agrarias", levels: F, course: "Engenharia de Alimentos", topics: ["Ciência e Tecnologia de Alimentos"] },

  // ---------------------------------------------------------------- Sociais aplicadas
  {
    area: "sociais_aplicadas",
    levels: F,
    course: "Direito",
    topics: [
      "Introdução ao Estudo do Direito", "Direito Constitucional", "Direito Civil", "Direito Penal",
      "Direito Processual Civil", "Direito Processual Penal", "Direito Administrativo", "Direito Tributário",
      "Direito do Trabalho", "Direito Empresarial", "Direito Internacional", "Direitos Humanos",
      "Direito Ambiental", "Direito do Consumidor", "Filosofia do Direito",
    ],
  },
  {
    area: "sociais_aplicadas",
    levels: F,
    course: "Administração",
    topics: [
      "Administração", "Teoria Geral da Administração", "Gestão de Pessoas", "Marketing",
      "Finanças Corporativas", "Logística", "Empreendedorismo", "Gestão de Projetos",
      "Estratégia Empresarial", "Comportamento Organizacional",
    ],
  },
  { area: "sociais_aplicadas", levels: F, course: "Ciências Contábeis", topics: ["Contabilidade", "Contabilidade Geral", "Contabilidade de Custos", "Auditoria", "Análise de Investimentos"] },
  { area: "sociais_aplicadas", levels: F, course: "Economia", topics: ["Economia", "Microeconomia", "Macroeconomia", "Economia Brasileira", "Econometria"] },
  { area: "sociais_aplicadas", levels: F, course: "Comunicação", topics: ["Jornalismo", "Publicidade e Propaganda", "Teorias da Comunicação", "Design Gráfico", "UX Design"] },
  { area: "sociais_aplicadas", levels: F, course: "Arquitetura e Urbanismo", topics: ["Arquitetura e Urbanismo", "Projeto Arquitetônico", "História da Arquitetura", "Urbanismo", "Conforto Ambiental"] },
  { area: "sociais_aplicadas", levels: F, course: "Serviço Social", topics: ["Serviço Social"] },

  // ---------------------------------------------------------------- Humanas
  {
    area: "humanas",
    levels: F,
    course: "Psicologia",
    topics: ["Psicologia", "Psicologia do Desenvolvimento", "Psicopatologia", "Psicologia Social", "Teorias da Personalidade", "Neuropsicologia", "Avaliação Psicológica"],
  },
  { area: "humanas", levels: F, course: "Pedagogia", topics: ["Pedagogia", "Didática", "Psicologia da Educação", "Políticas Educacionais", "Alfabetização e Letramento", "Educação Inclusiva"] },
  { area: "humanas", levels: F, course: "História", topics: ["Historiografia", "História Antiga", "História Medieval", "História Moderna", "História Contemporânea"] },
  { area: "humanas", levels: F, course: "Filosofia", topics: ["Lógica", "Epistemologia", "Metafísica"] },
  { area: "humanas", levels: F, course: "Ciências Sociais", topics: ["Antropologia", "Ciência Política"] },

  // ---------------------------------------------------------------- Letras e artes
  {
    area: "letras_artes",
    levels: F,
    course: "Letras",
    topics: ["Linguística", "Teoria Literária", "Fonética e Fonologia", "Morfologia", "Sintaxe", "Semântica", "Literatura Portuguesa", "Tradução", "Libras"],
  },
  { area: "letras_artes", levels: F, course: "Artes", topics: ["Música", "Teoria Musical", "Artes Visuais", "Cinema", "Teatro", "Dança"] },

  // ---------------------------------------------------------------- Multidisciplinar e preparatórios
  { area: "multidisciplinar", levels: F, topics: ["Metodologia Científica", "Ensino", "Meio Ambiente", "TCC"] },
  { area: "preparatorios", levels: F, topics: ["Concursos Públicos", "OAB", "Residência Médica", "Cisco CCNA", "AWS", "Microsoft Azure"] },
  { area: "preparatorios", levels: F, course: "Concursos", topics: ["Raciocínio Lógico", "Informática para Concursos", "Legislação"] },
  { area: "preparatorios", levels: [], course: "Idiomas", topics: ["Francês", "Alemão", "Italiano", "Japonês", "Mandarim"] },
];
