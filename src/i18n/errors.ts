import type { Locale } from "./config";

/**
 * Traduções das mensagens do servidor. A chave é o texto original em português (como lançado
 * pelas regras de negócio); `{nome}` marca trechos variáveis, que são preservados.
 */
const MESSAGES: Record<string, { en: string; es: string }> = {
  "Algo deu errado. Tente novamente.": { en: "Something went wrong. Please try again.", es: "Algo salió mal. Inténtalo de nuevo." },
  "Dados inválidos.": { en: "Invalid data.", es: "Datos inválidos." },
  "A verificação de CPF está indisponível no momento. Tente novamente mais tarde.": {
    en: "CPF verification is unavailable right now. Please try again later.",
    es: "La verificación de CPF no está disponible en este momento. Inténtalo más tarde.",
  },
  "CPF inválido ou dados não conferem.": {
    en: "Invalid CPF or the details don't match.",
    es: "CPF inválido o los datos no coinciden.",
  },
  "CPF inválido. Confira os números digitados.": {
    en: "Invalid CPF. Check the numbers you typed.",
    es: "CPF inválido. Revisa los números ingresados.",
  },
  "Registro não encontrado.": { en: "Log not found.", es: "Registro no encontrado." },
  "Só registros do contexto Acadêmico têm área do conhecimento.": { en: "Only logs in the Academic context have a field of knowledge.", es: "Solo los registros del contexto Académico tienen área del conocimiento." },
  "Data de nascimento inválida.": { en: "Invalid date of birth.", es: "Fecha de nacimiento inválida." },
  "Esta conta já tem um CPF vinculado. Para alterar, fale com o suporte.": {
    en: "This account already has a linked CPF. To change it, contact support.",
    es: "Esta cuenta ya tiene un CPF vinculado. Para cambiarlo, contacta al soporte.",
  },
  "Esta matrícula já está vinculada a outra conta nesta instituição. Fale com o suporte se for um erro.": {
    en: "This enrollment number is already linked to another account at this institution. Contact support if this is a mistake.",
    es: "Esta matrícula ya está vinculada a otra cuenta en esta institución. Contacta al soporte si es un error.",
  },
  "Esta sessão já teve um intervalo. Inicie uma nova sessão de estudo.": {
    en: "This session already had a break. Start a new study session.",
    es: "Esta sesión ya tuvo un intervalo. Inicia una nueva sesión de estudio.",
  },
  "Este CPF já está vinculado a outra conta. Se acha que é um erro, fale com o suporte.": {
    en: "This CPF is already linked to another account. If you think this is a mistake, contact support.",
    es: "Este CPF ya está vinculado a otra cuenta. Si crees que es un error, contacta al soporte.",
  },
  "Este tema está arquivado. Restaure-o para estudar.": {
    en: "This topic is archived. Restore it to study.",
    es: "Este tema está archivado. Restáuralo para estudiar.",
  },
  "Fuso horário inválido.": { en: "Invalid time zone.", es: "Zona horaria inválida." },
  "Informe a cidade.": { en: "Enter the city.", es: "Indica la ciudad." },
  "Informe a data de nascimento.": { en: "Enter your date of birth.", es: "Indica tu fecha de nacimiento." },
  "Informe o motivo.": { en: "Enter the reason.", es: "Indica el motivo." },
  "Informe o nome da instituição.": { en: "Enter the institution name.", es: "Indica el nombre de la institución." },
  "Informe uma matrícula válida.": { en: "Enter a valid enrollment number.", es: "Indica una matrícula válida." },
  "Instituição não encontrada.": { en: "Institution not found.", es: "Institución no encontrada." },
  "Já existe um tema com esse nome neste registro.": { en: "A topic with that name already exists in this log.", es: "Ya existe un tema con ese nombre en este registro." },
  "Já existe um registro com esse nome.": { en: "A log with that name already exists.", es: "Ya existe un registro con ese nombre." },
  "Muitas tentativas de verificação. Tente novamente em 24 horas.": {
    en: "Too many verification attempts. Try again in 24 hours.",
    es: "Demasiados intentos de verificación. Inténtalo de nuevo en 24 horas.",
  },
  "Método de estudo indisponível.": { en: "Study method unavailable.", es: "Método de estudio no disponible." },
  "Método inválido.": { en: "Invalid method.", es: "Método inválido." },
  "O intervalo começa ao terminar uma sessão de estudo.": {
    en: "A break starts when you finish a study session.",
    es: "El intervalo empieza al terminar una sesión de estudio.",
  },
  "Objetivo inválido.": { en: "Invalid goal.", es: "Objetivo inválido." },
  "Para participar do ranking da instituição, vincule seu CPF primeiro.": {
    en: "To join the institution ranking, link your CPF first.",
    es: "Para participar en el ranking de la institución, vincula tu CPF primero.",
  },
  "Perfil não encontrado.": { en: "Profile not found.", es: "Perfil no encontrado." },
  "Recurso exclusivo para assinantes Focus Premium.": {
    en: "Feature exclusive to Focus Premium subscribers.",
    es: "Función exclusiva para suscriptores de Focus Premium.",
  },
  "Sinônimo inválido.": { en: "Invalid synonym.", es: "Sinónimo inválido." },
  "Tema do catálogo inválido.": { en: "Invalid catalog topic.", es: "Tema del catálogo inválido." },
  "Tema do catálogo não encontrado.": { en: "Catalog topic not found.", es: "Tema del catálogo no encontrado." },
  "Tema inválido.": { en: "Invalid topic.", es: "Tema inválido." },
  "Tema não encontrado.": { en: "Topic not found.", es: "Tema no encontrado." },
  "Só temas do contexto Acadêmico podem ser vinculados ao catálogo.": {
    en: "Only topics in the Academic context can be linked to the catalog.",
    es: "Solo los temas del contexto Académico se pueden vincular al catálogo.",
  },
  "UF inválida.": { en: "Invalid state.", es: "Estado inválido." },
  "Você já tem pedidos em análise. Aguarde a resposta.": {
    en: "You already have requests under review. Please wait for a reply.",
    es: "Ya tienes solicitudes en revisión. Espera la respuesta.",
  },
  "Área do conhecimento inválida.": { en: "Invalid field of knowledge.", es: "Área de conocimiento inválida." },
  "Área inválida.": { en: "Invalid field.", es: "Área inválida." },
  "Acompanhe no máximo {n} temas.": { en: "Follow at most {n} topics.", es: "Sigue como máximo {n} temas." },
  "Escolha no máximo {n} objetivos.": { en: "Choose at most {n} goals.", es: "Elige como máximo {n} objetivos." },
  "Escolha no máximo {n} áreas de interesse.": {
    en: "Choose at most {n} fields of interest.",
    es: "Elige como máximo {n} áreas de interés.",
  },
  "Você poderá trocar de instituição a partir de {date}.": {
    en: "You can switch institutions from {date}.",
    es: "Podrás cambiar de institución a partir del {date}.",
  },
  "A duração deve estar entre {min} e {max} minutos.": {
    en: "Duration must be between {min} and {max} minutes.",
    es: "La duración debe estar entre {min} y {max} minutos.",
  },
  "O intervalo deve estar entre {min} e {max} minutos.": {
    en: "The break must be between {min} and {max} minutes.",
    es: "El intervalo debe estar entre {min} y {max} minutos.",
  },
  "Informe a duração do estudo em minutos.": {
    en: "Enter the study duration in minutes.",
    es: "Indica la duración del estudio en minutos.",
  },
  "Informe a duração do intervalo em minutos.": {
    en: "Enter the break duration in minutes.",
    es: "Indica la duración del intervalo en minutos.",
  },
  "A data final deve ser posterior à inicial.": {
    en: "The end date must be after the start date.",
    es: "La fecha final debe ser posterior a la inicial.",
  },
  "Data inválida.": { en: "Invalid date.", es: "Fecha inválida." },
  "Informe as datas inicial e final.": { en: "Enter the start and end dates.", es: "Indica las fechas inicial y final." },
  "Cor inválida.": { en: "Invalid color.", es: "Color inválido." },
  "Identificador inválido.": { en: "Invalid identifier.", es: "Identificador inválido." },
  "Informe um nome.": { en: "Enter a name.", es: "Indica un nombre." },
  "Nome muito curto.": { en: "Name is too short.", es: "Nombre demasiado corto." },
  "Nome muito longo (máx. 40).": { en: "Name is too long (max. 40).", es: "Nombre demasiado largo (máx. 40)." },
  "Nome muito longo (máx. 80).": { en: "Name is too long (max. 80).", es: "Nombre demasiado largo (máx. 80)." },
  // Contextos e projetos
  "Contexto inválido.": { en: "Invalid context.", es: "Contexto inválido." },
  "Projeto não encontrado.": { en: "Project not found.", es: "Proyecto no encontrado." },
  "Só o dono do projeto pode fazer isso.": { en: "Only the project owner can do this.", es: "Solo el dueño del proyecto puede hacer esto." },
  "Horas a cumprir inválidas.": { en: "Invalid hours to complete.", es: "Horas a cumplir inválidas." },
  "Nenhuma conta com esse código.": { en: "No account with that code.", es: "Ninguna cuenta con ese código." },
  "Você já participa deste projeto.": { en: "You are already in this project.", es: "Ya participas en este proyecto." },
  "Essa pessoa já participa ou já foi convidada.": {
    en: "This person is already a member or has already been invited.",
    es: "Esa persona ya participa o ya fue invitada.",
  },
  "Convite não encontrado.": { en: "Invitation not found.", es: "Invitación no encontrada." },
  "Participante não encontrado.": { en: "Member not found.", es: "Participante no encontrado." },
  "O dono não pode sair do próprio projeto.": { en: "The owner can't leave their own project.", es: "El dueño no puede salir de su propio proyecto." },
  "Responsável precisa participar do projeto.": { en: "The assignee must be a project member.", es: "El responsable debe participar en el proyecto." },
  "Tarefa não encontrada.": { en: "Task not found.", es: "Tarea no encontrada." },
  "Este projeto não está ativo.": { en: "This project isn't active.", es: "Este proyecto no está activo." },
  "Esta tarefa já foi concluída.": { en: "This task is already done.", es: "Esta tarea ya fue concluida." },
  "Descrição muito longa (máx. 500).": { en: "Description is too long (max. 500).", es: "Descripción demasiado larga (máx. 500)." },
  "Informe o código da conta.": { en: "Enter the account code.", es: "Indica el código de la cuenta." },
  "Informe a tarefa.": { en: "Enter the task.", es: "Indica la tarea." },
  "Tarefa muito longa (máx. 120).": { en: "Task is too long (max. 120).", es: "Tarea demasiado larga (máx. 120)." },
  "O projeto já tem o máximo de {n} participantes.": {
    en: "The project already has the maximum of {n} members.",
    es: "El proyecto ya tiene el máximo de {n} participantes.",
  },
  "O projeto já tem o máximo de {n} tarefas.": {
    en: "The project already has the maximum of {n} tasks.",
    es: "El proyecto ya tiene el máximo de {n} tareas.",
  },
  // Organizações
  "Para cadastrar uma organização, vincule seu CPF primeiro.": { en: "To register an organization, link your CPF first.", es: "Para registrar una organización, vincula tu CPF primero." },
  "CNPJ inválido.": { en: "Invalid CNPJ.", es: "CNPJ inválido." },
  "Você já tem pedidos em andamento. Aguarde a análise.": { en: "You already have requests in progress. Please wait for the review.", es: "Ya tienes solicitudes en curso. Espera el análisis." },
  "Este CNPJ já está cadastrado ou em análise.": { en: "This CNPJ is already registered or under review.", es: "Este CNPJ ya está registrado o en análisis." },
  "A consulta de CNPJ está indisponível no momento. Tente novamente mais tarde.": { en: "CNPJ lookup is unavailable right now. Please try again later.", es: "La consulta de CNPJ no está disponible en este momento. Inténtalo más tarde." },
  "CNPJ não encontrado.": { en: "CNPJ not found.", es: "CNPJ no encontrado." },
  "Este CNPJ não está ativo.": { en: "This CNPJ is not active.", es: "Este CNPJ no está activo." },
  "Link inválido ou já utilizado.": { en: "Invalid or already used link.", es: "Enlace inválido o ya utilizado." },
  "Este link expirou. Faça o pedido novamente.": { en: "This link has expired. Please submit the request again.", es: "Este enlace expiró. Haz la solicitud de nuevo." },
  "Pedido não encontrado.": { en: "Request not found.", es: "Solicitud no encontrada." },
  "Organização não encontrada.": { en: "Organization not found.", es: "Organización no encontrada." },
  "Só o dono ou um gestor da organização pode fazer isso.": { en: "Only the organization owner or a manager can do this.", es: "Solo el dueño o un gestor de la organización puede hacer esto." },
  "Papel inválido.": { en: "Invalid role.", es: "Rol inválido." },
  "Só o dono pode convidar gestores.": { en: "Only the owner can invite managers.", es: "Solo el dueño puede invitar gestores." },
  "A organização atingiu o limite de membros.": { en: "The organization reached the member limit.", es: "La organización alcanzó el límite de miembros." },
  "O papel do dono não muda.": { en: "The owner role can't change.", es: "El rol del dueño no cambia." },
  "Só o dono pode alterar gestores e papéis.": { en: "Only the owner can change managers and roles.", es: "Solo el dueño puede cambiar gestores y roles." },
  "O dono não pode sair da organização.": { en: "The owner can't leave the organization.", es: "El dueño no puede salir de la organización." },
  "Só o dono pode remover gestores.": { en: "Only the owner can remove managers.", es: "Solo el dueño puede quitar gestores." },
  "Só quem criou o projeto ou o dono da organização pode designar pessoas.": { en: "Only the project creator or the organization owner can assign people.", es: "Solo quien creó el proyecto o el dueño de la organización puede asignar personas." },
  "Essa pessoa não é membro ativo da organização.": { en: "This person isn't an active member of the organization.", es: "Esa persona no es miembro activo de la organización." },
  "Acesso restrito.": { en: "Restricted access.", es: "Acceso restringido." },
  "Área muito longa (máx. 60).": { en: "Area is too long (max. 60).", es: "Área demasiado larga (máx. 60)." },
  "Tipo inválido.": { en: "Invalid type.", es: "Tipo inválido." },
  "Informe o nome fantasia.": { en: "Enter the trade name.", es: "Indica el nombre comercial." },
  "Nome muito longo (máx. 120).": { en: "Name is too long (max. 120).", es: "Nombre demasiado largo (máx. 120)." },
  "E-mail inválido.": { en: "Invalid email.", es: "Correo inválido." },
  "Informe o seu cargo.": { en: "Enter your position.", es: "Indica tu cargo." },
  "Cargo muito longo (máx. 80).": { en: "Position is too long (max. 80).", es: "Cargo demasiado largo (máx. 80)." },
  "Conte em poucas palavras o seu interesse.": { en: "Tell us briefly why you're interested.", es: "Cuéntanos brevemente tu interés." },
  "Mensagem muito longa (máx. 1000).": { en: "Message is too long (max. 1000).", es: "Mensaje demasiado largo (máx. 1000)." },
  "A área de utilização só muda no perfil Pessoal.": {
    en: "The usage area can only change in the Personal profile.",
    es: "El área de uso solo cambia en el perfil Personal.",
  },
  "Área de utilização inválida.": { en: "Invalid usage area.", es: "Área de uso inválida." },
  // Aceite de membros
  "Este perfil é liberado quando uma instituição ou empresa aceitar você.": { en: "This profile unlocks when a school or company accepts you.", es: "Este perfil se libera cuando una institución o empresa te acepte." },
  "Para pedir vínculo com uma empresa, vincule seu CPF primeiro.": { en: "To request a link with a company, link your CPF first.", es: "Para pedir vínculo con una empresa, vincula tu CPF primero." },
  "Você já participa desta organização.": { en: "You are already in this organization.", es: "Ya participas en esta organización." },
  "Esta matrícula já está vinculada a outra conta nesta organização.": { en: "This registration number is already linked to another account in this organization.", es: "Esta matrícula ya está vinculada a otra cuenta en esta organización." },
  "Vincule a organização ao cadastro do e-MEC/INEP antes de enviar a lista de matrículas.": { en: "Link the organization to its e-MEC/INEP record before sending the enrollment list.", es: "Vincula la organización a su registro e-MEC/INEP antes de enviar la lista de matrículas." },
  "Nenhuma matrícula válida na lista.": { en: "No valid enrollment numbers in the list.", es: "Ninguna matrícula válida en la lista." },
  "Envie no máximo 100.000 matrículas por vez.": { en: "Send at most 100,000 enrollment numbers at a time.", es: "Envía como máximo 100.000 matrículas por vez." },
  "Só o dono da organização pode fazer isso.": { en: "Only the organization owner can do this.", es: "Solo el dueño de la organización puede hacer esto." },
  "Só instituições de ensino têm registro no e-MEC/INEP.": { en: "Only schools have an e-MEC/INEP record.", es: "Solo las instituciones educativas tienen registro e-MEC/INEP." },
  "Esta instituição já está vinculada a outra organização.": { en: "This institution is already linked to another organization.", es: "Esta institución ya está vinculada a otra organización." },
  // Mover projetos
  "Destino inválido para este projeto.": { en: "Invalid destination for this project.", es: "Destino inválido para este proyecto." },
  "O projeto já está nesse perfil.": { en: "The project is already in that profile.", es: "El proyecto ya está en ese perfil." },
  "Você já tem um pedido de transferência aguardando para este projeto.": { en: "You already have a pending transfer request for this project.", es: "Ya tienes una solicitud de transferencia pendiente para este proyecto." },
  "Só o dono do projeto pode designar tarefas para outras pessoas.": { en: "Only the project owner can assign tasks to other people.", es: "Solo el dueño del proyecto puede asignar tareas a otras personas." },
  "Só quem criou a tarefa ou o dono do projeto pode excluí-la.": { en: "Only the task creator or the project owner can delete it.", es: "Solo quien creó la tarea o el dueño del proyecto puede eliminarla." },
  "Informe o site começando com https://.": { en: "Enter the website starting with https://.", es: "Indica el sitio comenzando con https://." },
  "Texto muito longo (máx. 1200).": { en: "Text is too long (max. 1200).", es: "Texto demasiado largo (máx. 1200)." },
  // Amigos
  "Esse é o seu próprio código.": { en: "That's your own code.", es: "Ese es tu propio código." },
  "Vocês já são amigos ou já existe um pedido.": { en: "You're already friends or there's already a request.", es: "Ya son amigos o ya existe una solicitud." },
  "Você já tem o máximo de {n} amigos.": { en: "You already have the maximum of {n} friends.", es: "Ya tienes el máximo de {n} amigos." },
  // Cronograma
  "O início precisa ser antes do prazo.": { en: "The start must be before the due date.", es: "El inicio debe ser antes del plazo." },
  "Essa dependência criaria um ciclo entre as tarefas.": { en: "That dependency would create a cycle between tasks.", es: "Esa dependencia crearía un ciclo entre las tareas." },
  "Fase muito longa (máx. 60).": { en: "Phase is too long (max. 60).", es: "Fase demasiado larga (máx. 60)." },
  // Correção de sessões
  "Sessão não encontrada.": { en: "Session not found.", es: "Sesión no encontrada." },
  "Esta sessão já foi excluída.": { en: "This session has already been deleted.", es: "Esta sesión ya fue eliminada." },
  "Encerre a sessão antes de corrigi-la.": { en: "End the session before fixing it.", es: "Termina la sesión antes de corregirla." },
  "Só dá para corrigir sessões da semana atual.": { en: "Only sessions from the current week can be fixed.", es: "Solo se pueden corregir sesiones de la semana actual." },
  "Esta sessão já teve o tempo reduzido. Se precisar, exclua-a.": { en: "This session's time was already reduced. If needed, delete it.", es: "El tiempo de esta sesión ya fue reducido. Si es necesario, elimínala." },
  "Informe o tempo que você realmente estudou (mín. 1 min).": { en: "Enter the time you actually studied (min. 1 min).", es: "Indica el tiempo que realmente estudiaste (mín. 1 min)." },
  "O novo tempo precisa ser menor que o registrado. Não é possível acrescentar horas.": { en: "The new time must be less than what was logged. Adding hours isn't possible.", es: "El nuevo tiempo debe ser menor que el registrado. No es posible agregar horas." },
  // Vitrine de conquistas
  "Escolha no máximo {n} conquistas.": { en: "Choose at most {n} achievements.", es: "Elige como máximo {n} logros." },
  "Conquista inválida.": { en: "Invalid achievement.", es: "Logro inválido." },
  "Só dá para exibir conquistas que você já desbloqueou.": { en: "You can only show achievements you have unlocked.", es: "Solo puedes mostrar logros que ya desbloqueaste." },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pré-compila os modelos com variáveis ("{n}") em expressões regulares. */
const TEMPLATES = Object.entries(MESSAGES)
  .filter(([pt]) => pt.includes("{"))
  .map(([pt, tr]) => {
    const names: string[] = [];
    const source = escapeRe(pt).replace(/\\\{(\w+)\\\}/g, (_, name: string) => {
      names.push(name);
      return "(.+?)";
    });
    return { re: new RegExp(`^${source}$`), names, tr };
  });

/** Existe tradução cadastrada para esta mensagem (fixa ou com variáveis)? */
export function hasTranslation(message: string): boolean {
  return message in MESSAGES || TEMPLATES.some((t) => t.re.test(message));
}

/** Traduz uma mensagem do servidor; se não houver tradução, devolve o original. */
export function translateMessage(message: string, locale: Locale): string {
  if (locale === "pt-BR") return message;
  const direct = MESSAGES[message];
  if (direct) return direct[locale];
  for (const t of TEMPLATES) {
    const m = t.re.exec(message);
    if (!m) continue;
    let out = t.tr[locale];
    t.names.forEach((name, i) => (out = out.replace(`{${name}}`, m[i + 1])));
    return out;
  }
  return message;
}
