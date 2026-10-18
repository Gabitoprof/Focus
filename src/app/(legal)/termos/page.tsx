import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, TERMS_UPDATED_AT } from "@/domain/legal";

export const metadata: Metadata = { title: "Termos de Uso · Focus" };

export default function TermsPage() {
  const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-sm text-text-3">Última atualização: {TERMS_UPDATED_AT}</p>
      <p>
        Estes termos regem o uso da <strong>Focus</strong>, plataforma de foco e estudos com cronômetro, registro de
        horas, projetos, rankings e conquistas. Ao criar uma conta ou continuar usando a Focus, você concorda com estes
        termos e com a <Link href="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. Fase de testes</h2>
      <p>
        A Focus está em <strong>fase de testes (beta)</strong>: recursos podem mudar, ficar instáveis ou ser removidos,
        e podem ocorrer interrupções. Durante esta fase o uso é <strong>gratuito</strong>, inclusive os rankings. Se no
        futuro houver planos pagos, os preços e condições serão informados com antecedência e nada será cobrado sem a
        sua contratação expressa.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Informe dados verdadeiros e mantenha sua senha em segredo. Você responde pelo que é feito na sua conta.</li>
        <li>
          Cada pessoa pode ter <strong>uma conta</strong>. Quando o CPF é verificado, ele fica vinculado a uma única
          conta.
        </li>
        <li>
          Menores de 18 anos devem usar a Focus com conhecimento e autorização dos pais ou responsáveis (veja a Política
          de Privacidade).
        </li>
        <li>Você pode pedir a exclusão da conta a qualquer momento pelo e-mail {mail}.</li>
      </ul>

      <h2>3. Uso justo e rankings</h2>
      <p>Os rankings só fazem sentido se as horas forem reais. Por isso, não é permitido:</p>
      <ul>
        <li>
          manipular o cronômetro, os relógios do dispositivo, as requisições ao servidor ou usar programas e robôs para
          registrar tempo que não foi de estudo ou trabalho;
        </li>
        <li>criar várias contas, usar dados de terceiros ou se passar por outra pessoa ou organização;</li>
        <li>tentar acessar dados de outras pessoas, explorar falhas ou sobrecarregar a plataforma;</li>
        <li>usar nomes, temas, projetos ou textos ofensivos, discriminatórios ou ilegais.</li>
      </ul>
      <p>
        Sessões suspeitas podem ser sinalizadas para revisão. Em caso de violação, podemos corrigir ou remover registros
        e pontos, retirar a pessoa dos rankings e suspender ou encerrar a conta. A correção de sessões no Painel permite
        apenas <strong>reduzir</strong> ou excluir tempo, nunca acrescentar.
      </p>

      <h2>4. Instituições e empresas</h2>
      <ul>
        <li>
          Quem cadastra uma organização declara ter autorização para representá-la. O cadastro passa por verificações
          automáticas (como o CNPJ em bases públicas) e pode ser analisado antes de ser aprovado.
        </li>
        <li>
          Donos e gestores são responsáveis pelo uso que fazem dos dados dos membros dentro da Focus e devem tratá-los
          apenas para fins acadêmicos ou profissionais legítimos, conforme a LGPD.
        </li>
        <li>
          A organização vê somente o perfil ligado a ela (Acadêmico ou Profissional); o perfil Pessoal de cada membro
          não é compartilhado.
        </li>
      </ul>

      <h2>5. Conteúdo que você cria</h2>
      <p>
        Registros, temas, projetos e tarefas continuam sendo seus. Você nos autoriza a armazená-los e exibi-los dentro da
        Focus apenas para prestar o serviço (por exemplo, mostrar um projeto aos participantes). Temas criados por
        usuários podem, de forma anônima, ajudar a ampliar o catálogo de temas da plataforma.
      </p>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Fazemos o possível para manter a Focus no ar e seus dados seguros, mas, por ser uma versão de testes, ela é
        oferecida &ldquo;no estado em que se encontra&rdquo;, sem garantia de funcionamento ininterrupto ou livre de erros.
        Recomendamos não depender exclusivamente da Focus para controles oficiais (como frequência ou horas exigidas por
        instituições). Na medida permitida pela lei, não respondemos por danos indiretos decorrentes do uso ou da
        indisponibilidade da plataforma. Nada nestes termos limita direitos garantidos pelo Código de Defesa do
        Consumidor.
      </p>

      <h2>7. Mudanças e encerramento</h2>
      <p>
        Podemos atualizar estes termos. Quando a mudança for relevante, você verá o pedido para aceitar a nova versão ao
        entrar na Focus; se não concordar, pode deixar de usar e pedir a exclusão da conta. Também podemos encerrar a
        plataforma, avisando com antecedência razoável e permitindo que você solicite uma cópia dos seus dados.
      </p>

      <h2>8. Lei e foro</h2>
      <p>
        Estes termos seguem as leis do Brasil. Fica eleito o foro do domicílio do usuário para resolver qualquer questão
        relacionada a eles.
      </p>

      <h2>9. Contato</h2>
      <p>Dúvidas, denúncias ou pedidos: {mail}.</p>
    </>
  );
}
