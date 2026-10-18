import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, TERMS_UPDATED_AT } from "@/domain/legal";

export const metadata: Metadata = { title: "Política de Privacidade · Focus" };

export default function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-sm text-text-3">Última atualização: {TERMS_UPDATED_AT}</p>
      <p>
        Esta política explica quais dados pessoais a <strong>Focus</strong> coleta, por que coleta, com quem
        compartilha e como você pode exercer seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD — Lei
        nº 13.709/2018). A Focus está em <strong>fase de testes</strong>; esta política vale para todo o uso da
        plataforma.
      </p>

      <h2>1. Quem é o responsável pelos seus dados</h2>
      <p>
        O controlador dos dados é o responsável pela plataforma Focus. Para qualquer assunto sobre privacidade —
        inclusive falar com o encarregado (DPO) —, use o e-mail {mail}.
      </p>

      <h2>2. Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome de exibição, e-mail e senha. A senha é guardada apenas de forma criptografada
          (não conseguimos vê-la).
        </li>
        <li>
          <strong>Perfil:</strong> fuso horário, idioma, código público (ex.: FCS-XXXXXXXX), áreas de interesse e o
          perfil em uso (Pessoal, Acadêmico ou Profissional).
        </li>
        <li>
          <strong>Uso da plataforma:</strong> sessões de foco (início, fim, pausas, intervalos, método), registros e
          temas que você cria, projetos e tarefas, XP, score, conquistas, amizades e preferências salvas no seu
          navegador (como atalhos e o tema escolhido no cronômetro).
        </li>
        <li>
          <strong>CPF (opcional, para vínculos e ranking de instituições):</strong> o CPF é conferido junto com a data
          de nascimento em um serviço de verificação e <strong>não é guardado</strong>. Guardamos apenas um código
          protegido (HMAC) que impede o mesmo CPF de ter duas contas, os dois últimos dígitos (para você reconhecer) e
          o ano de nascimento. A data completa é descartada após a verificação.
        </li>
        <li>
          <strong>Vínculo com instituição ou empresa:</strong> a organização escolhida, papel (membro, gestor, dono),
          turma/área e a matrícula ou registro — guardada de forma protegida (HMAC) para o aceite automático e, quando
          necessário, em texto para a análise do gestor.
        </li>
        <li>
          <strong>Cadastro de organizações:</strong> CNPJ, nome e dados públicos da empresa/instituição consultados
          em bases públicas, e-mail de contato e cargo de quem fez o pedido.
        </li>
        <li>
          <strong>Dados técnicos:</strong> cookies essenciais de sessão (para manter você conectado) e registros de
          segurança (como data e tipo de ações importantes). Não usamos cookies de publicidade nem de rastreamento.
        </li>
      </ul>

      <h2>3. Para que usamos (e com qual base legal)</h2>
      <ul>
        <li>
          <strong>Prestar o serviço</strong> — cronômetro, Painel, Retrospectiva, projetos, conquistas e rankings
          (execução do contrato, art. 7º, V).
        </li>
        <li>
          <strong>Garantir rankings justos e uma conta por pessoa</strong> — validação de CPF e regras contra fraude no
          cronômetro (legítimo interesse e prevenção à fraude, art. 7º, IX, e art. 11, II, g).
        </li>
        <li>
          <strong>Vínculos com instituições e empresas</strong>, quando você pede ou aceita o vínculo (execução do
          contrato e consentimento).
        </li>
        <li>
          <strong>Comunicação necessária</strong>, como recuperação de senha e confirmação de cadastro de organização.
        </li>
        <li>
          <strong>Segurança e melhoria da plataforma</strong>, com dados agregados sempre que possível.
        </li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade.</p>

      <h2>4. O que outras pessoas podem ver</h2>
      <ul>
        <li>
          <strong>Rankings:</strong> seu nome de exibição, código público, horas e XP aparecem para outros usuários.
          Use um nome de exibição com o qual se sinta confortável.
        </li>
        <li>
          <strong>Amigos e projetos:</strong> participantes de um projeto veem as horas e a atividade nele; amigos veem
          sua posição no ranking de amigos.
        </li>
        <li>
          <strong>Instituições e empresas:</strong> veem somente o que acontece no perfil ligado a elas (Acadêmico ou
          Profissional) e nos projetos da organização. Seu perfil Pessoal nunca é compartilhado com a organização.
        </li>
        <li>O CPF, a senha e a data de nascimento nunca são exibidos para ninguém.</li>
      </ul>

      <h2>5. Com quem compartilhamos (operadores)</h2>
      <p>Usamos fornecedores que tratam dados em nosso nome, apenas para fazer a Focus funcionar:</p>
      <ul>
        <li>
          <strong>Vercel</strong> (hospedagem do site) e <strong>Supabase</strong> (banco de dados) — servidores nos
          Estados Unidos;
        </li>
        <li>
          <strong>Resend</strong> (envio de e-mails), <strong>CPFHub</strong> (verificação de CPF) e{" "}
          <strong>CNPJá</strong> (consulta de CNPJ em bases públicas).
        </li>
      </ul>
      <p>
        Como parte desses serviços fica fora do Brasil, há <strong>transferência internacional de dados</strong>, feita
        com fornecedores que adotam medidas de segurança e confidencialidade compatíveis com a LGPD (art. 33).
        Também podemos compartilhar dados quando a lei ou uma autoridade exigir.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>
        Enquanto sua conta estiver ativa. Se você pedir a exclusão, apagamos ou tornamos anônimos os seus dados em até
        30 dias, salvo o que a lei obrigue a manter (por exemplo, registros de acesso, guardados por 6 meses conforme o
        Marco Civil da Internet). Sessões que você exclui no Painel deixam de aparecer e de contar, mas ficam registradas
        para auditoria contra fraude enquanto a conta existir.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode, a qualquer momento: confirmar se tratamos seus dados; acessá-los; corrigir dados incompletos ou
        errados; pedir anonimização, bloqueio ou eliminação de dados desnecessários; pedir a portabilidade; saber com
        quem compartilhamos; revogar consentimentos; e pedir a exclusão da conta. Basta escrever para {mail}.
        Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>8. Crianças e adolescentes</h2>
      <p>
        A Focus é voltada a estudantes e profissionais. Menores de 18 anos devem usar a plataforma com conhecimento e
        autorização dos pais ou responsáveis; menores de 12 anos só podem ter conta com consentimento específico de um
        responsável, que pode ser solicitado pelo e-mail {mail}. Tratamos dados de crianças e adolescentes sempre no
        seu melhor interesse (art. 14).
      </p>

      <h2>9. Segurança</h2>
      <p>
        Usamos conexões criptografadas, senhas com hash, CPF e matrícula protegidos por HMAC com chave secreta, acesso
        restrito ao banco e regras no servidor que impedem uma pessoa de ver dados de outra. Nenhum sistema é 100%
        seguro: se houver um incidente que possa trazer risco a você, avisaremos você e a ANPD.
      </p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Podemos atualizar esta política. Quando a mudança for relevante, pediremos que você leia e aceite a nova versão
        ao entrar na Focus. Veja também os <Link href="/termos">Termos de Uso</Link>.
      </p>
    </>
  );
}
