Licença Ğ1 - v0.2.9
===================

:data: 2017-04-04 12:59
:modificado: 2019-07-14 12:00

**Licença da moeda e compromisso de responsabilidade.**

Qualquer operação de certificação dum novo membro da Ğ1 deve ser previamente acompanhada pela transmissão desta licença da moeda Ğ1, a qual o/a certificador/a deve garantir que foi estudada, compreendida e aceite pela pessoa que será certificada.

Encoraja-se que qualquer evento de grupo relativo à Ğ1 seja acompanhado por uma transmissão desta licença, que poderá ser lida em voz alta, e transmitida por quaisquer meios.

Rede de confiança Ğ1 (RdC Ğ1)
------------------------------

**Nota de precaução:** Certificarmos alguém não é apenas assegurar-mo-nos que encontrámos a pessoa, é assegurarmos à comunidade Ğ1 que conhecemos suficientemente bem a pessoa a certificar, de modo a conseguirmos contactar a pessoa facilmente, e de termos condições para localizar uma conta em duplicado feita pela pessoa que receberá a nossa certificação, ou outro tipo de problemas (desaparecimento da pessoa…) fazendo despistagens que eventualmente permitirão revelar um problema. 

**Conselhos altamente recomendados**

Conhecermos bem uma pessoa pressupõe que seremos capazes de contactá-la por vários meios diferentes (físicos, electrónicos ou outros ...) mas também pressupõe que conhecemos várias pessoas que a conhecem tão bem quanto nós e, portanto, também serão capazes de contactá-la da mesma forma. Em particular, se não conhecermos bem nenhum dos outros certificadores dessa pessoa, há um forte indício de que não conhecemos bem essa pessoa, e uma certificação deste tipo aciona um alerta para toda a comunidade Ğ1. Em caso de conhecimento insuficiente, é fortemente aconselhável não certificarmos.

Nunca certifique alguém sozinho, mas faça-se acompanhar pelo menos por outro membro da RdC Ğ1 para evitar qualquer erro de manipulação. Em caso de erro, avise imediatamente os outros membros da RdC Ğ1.

Antes de qualquer certificação, assegure-se de verificar se a conta dessa pessoa já recebeu uma ou mais certificações (quer esteja em processo de validação ou já seja membro). Eventualmente, peça as informações para entrar em contacto com os outros certificadores, a fim de, juntos, verificarem que conhecem essa pessoa que quer abrir uma nova conta de membro, assim como a chave pública correspondente.

Verifique se o futuro certificado domina a gestão da sua conta: uma boa forma para verificar isto é transferir algumas Ğ1 da sua conta de membro para a conta dessa pessoa, e de seguida, solicitar o retorno do montante para a sua conta de membro…  isso garante que o futuro certificado possui um bom domínio da sua chave privada.

Verifique que os seus contactos estudaram e compreenderam a licença Ğ1 em vigor.

Se entender que um certificador real ou potencial de uma determinada conta não conhece a pessoa afecta a essa conta, alerte imediatamente especialistas no assunto dentro dos seus conhecidos na RdC Ğ1, para que o procedimento de validação seja verificado pela RdC Ğ1.

Quando fizer parte dos membros da RdC Ğ1 e estiver prestes a certificar uma nova conta:


**Deverá assegurar-se que:**

1°) Conhece suficientemente bem (não só "de vista") a pessoa que declara gerir a chave pública em questão (nova conta). Veja os conselhos altamente recomendados acima para garantir que “conhece bem a pessoa”.

2°) Já verificou em particular com essa pessoa que a chave pública que está prestes a certificar lhe pertence realmente (veja os conselhos acima).

3°) Já verificou em particular com essa pessoa que o seu documento Duniter de revogação da conta está criado, o que lhe permitirá eventualmente desactivar o seu estatuto de membro (no caso de roubo de uma conta, de uma mudança de identificação, de uma conta criada inadvertidamente, etc).

4a°) Já se encontrou com essa pessoa fisicamente para se certificar de que é de facto a pessoa bem conhecida por si e que detém a chave pública correcta que será certificada por si.

4b°) Ou então já verificou remotamente o conjunto pessoa / chave pública ao contactar essa pessoa por vários meios de comunicação diferentes, como o correio postal + rede social + fórum + email + videoconferência + telefone (reconhecendo a sua voz). Isto porque se eventualmente for possível piratear uma conta de e-mail ou uma conta de fórum, será muito mais difícil imaginar piratear quatro meios distintos de comunicação, de imitar a aparência da pessoa (vídeo), e além disso, de imitar a voz da pessoa.

Todavia o 4a°) permanece preferencial em relação ao 4b°), enquanto os pontos 1°), 2°) e 3°) são previamente indispensáveis.

**Regras abreviadas da RdC:**

Cada membro poderá atribuir um stock de 100 certificações possíveis, e que não pode emitir a uma taxa superior a 1 certificação / cada 5 dias.

Com uma validade de 2 meses, uma certificação para um novo membro só será definitivamente adoptada se no espaço desses 2 meses o membro certificado tiver obtido pelo menos 4 outras certificações, caso contrário, o processo de entrada terá de ser iniciado de novo.

Por isso para se tornar um novo membro da RdC Ğ1, será necessário obter 5 certificações, e encontrar-se a uma distância <= 5 elos de relação com 80% dos membros referentes da RdC.

Um membro da RdC Ğ1 torna-se membro referente a partir do momento em que ele terá recebido e emitido pelo menos Y [N] certificações, em que N é o número de membros da RdC e Y [N] = limite superior de N ^ (1/5). Exemplos:

* Para 1024 <N ≤ 3125, temos Y [N] = 5
* Para 7776 <N ≤ 16807, temos Y [N] = 7
* Para 59049 <N ≤ 100.000 temos Y [N] = 10

Logo que o novo membro tome lugar na RdC Ğ1, as suas certificações permanecerão válidas durante 2 anos.

Para permanecer como membro, será necessário renovar o seu acordo regularmente com a sua chave privada (a cada 12 meses) e certificar-se de que tem sempre pelo menos 5 certificações válidas após os 2 anos iniciais. 

Moeda Ğ1
----------

A Ğ1 é criada por meio de um Dividendo Universal (DU) para qualquer ser humano membro da Rede de Confiança Ğ1 e que toma a seguinte forma:

* 1 DU por pessoa por dia

**Código monetário Ğ1**

O valor em Ğ1 do DU é o mesmo a cada dia (com 1 dia = 86400 segundos) até ao dia de equinócio seguinte, onde o DU será então reavaliado de acordo com a fórmula:

* DUdiário (até ao próximo equinócio) = DUdiário (no dia de equinócio) + c² (M / N) (no dia de equinócio) / (182,625 dias)

Com os parâmetros:

* c = 4,88% / cada intervalo de tempo correspondente a um equinócio
* DU(0) = 10,00 Ğ1

E onde as variáveis são:

* *M* a massa monetária total no dia de equinócio
* *N* o número de membros no dia de equinócio

Software Ğ1 e licença Ğ1
--------------------------

Os programas informáticos Ğ1 que permitem aos utilizadores a gestão de utilização da Ğ1 devem transmitir esta licença com o programa informático, assim como o conjunto de parâmetros técnicos da moeda Ğ1 e da RdC Ğ1 que estão inscritos no bloco 0 da Ğ1. O programa informático que não cumpra estas obrigações da licença não é compatível com a Ğ1.

Para melhor aprofundar os detalhes técnicos é possível consultar diretamente o código do Duniter, que é software livre, assim com consultar os dados da blockchain Ğ1, obtendo-os por meio de uma instância (ou nó) Duniter Ğ1. 

Mais informações no sítio internet da equipa Duniter https://www.duniter.org
