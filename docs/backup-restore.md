# Backup integral e restauração — MB Óptica

## Política

- O workflow `Encrypted Full PostgreSQL Backup` executa um dump integral do PostgreSQL a cada 6 horas e também pode ser acionado manualmente.
- O arquivo é validado com `pg_restore --list`, criptografado com age antes de sair do runner e enviado como artefato do GitHub Actions por 90 dias.
- O banco Neon mantém seu próprio histórico/PITR conforme a retenção contratada. O dump externo é a segunda camada e não substitui a retenção do provedor.
- Não gravar dumps, dados pessoais, chaves privadas ou credenciais no Git.

## Secrets necessários no repositório

1. `MB_OPTICA_BACKUP_DATABASE_URL`: URL direta (não pooler) do PostgreSQL de produção.
2. `MB_OPTICA_BACKUP_AGE_RECIPIENT`: chave pública age usada para criptografar os dumps.

A chave privada age correspondente deve ser guardada fora do GitHub, em local seguro sob controle do responsável. Sem os dois secrets, o workflow falha de forma explícita e não declara backup concluído.

## Recuperação

1. Baixe o artefato do workflow e confira o SHA-256:
   `sha256sum -c mb-optica-full-<timestamp>.dump.age.sha256`
2. Descriptografe usando a chave privada guardada fora do GitHub:
   `age --decrypt --identity <caminho-da-chave-privada> --output mb-optica-restore.dump mb-optica-full-<timestamp>.dump.age`
3. Crie um banco de recuperação vazio, separado da produção.
4. Restaure primeiro nesse banco isolado:
   `pg_restore --no-owner --no-acl --dbname "<URL-DO-BANCO-DE-RECUPERACAO>" mb-optica-restore.dump`
5. Valide contagens, relacionamentos, login e fluxos de venda/financeiro antes de qualquer decisão sobre produção.

Nunca restaure diretamente sobre produção sem aprovação, backup prévio adicional e plano de reversão.

## Limitações e validação operacional

- O agendamento do GitHub Actions não é um mecanismo de backup por transação; ele oferece snapshots periódicos. Para recuperação entre snapshots, usar PITR do Neon conforme a retenção do plano.
- O workflow verifica a estrutura legível do dump, mas isso não equivale a um ensaio completo de restauração. O primeiro restore deve ser feito em banco isolado e registrado como homologação.
- Monitorar cada execução do workflow e tratar falha como incidente de backup, não como sucesso silencioso.
