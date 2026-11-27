/*
    authmiddleware.js
    --------------------------------------------------
    Middleware de autenticação e permissão.

    Este arquivo é usado nas rotas protegidas da API para:

    - Verificar se o usuário enviou um token;
    - Validar se o token é verdadeiro e ainda não expirou;
    - Salvar os dados do usuário dentro de req.usuario;
    - Permitir ou bloquear ações conforme o perfil do usuário.

    Exemplo de uso em uma rota:

    router.get(
        "/usuarios",
        autenticarToken,
        permitirPerfis("admin"),
        listarUsuarios
    );
*/

const jwt = require("jsonwebtoken");

function autenticarToken(req, res, next) {
    // O token normalmente vem no cabeçalho Authorization.
    // Exemplo:
    // Authorization: Bearer token_aqui
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({
            erro: "Token não encontrado."
        });
    }

    // Verifica se o header começa com "Bearer ".
    // Isso evita erro caso venha um formato inválido.
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            erro: "Formato de token inválido."
        });
    }

    // Remove a parte "Bearer " e fica apenas com o token.
    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            erro: "Token inválido."
        });
    }

    if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET não configurado no .env.");

        return res.status(500).json({
            erro: "Erro de configuração do servidor."
        });
    }

    try {
        // Valida o token usando a chave secreta do .env.
        // Se estiver válido, retorna os dados salvos dentro do token.
        const usuario = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"]
        });

        // Salva os dados do usuário na requisição.
        // Assim, as próximas funções da rota conseguem acessar:
        // req.usuario.id
        // req.usuario.nome
        // req.usuario.perfil
        req.usuario = usuario;

        // Libera a requisição para continuar para a próxima função.
        next();
    } catch {
        return res.status(403).json({
            erro: "Token inválido ou expirado."
        });
    }
}

function permitirPerfis(...perfisPermitidos) {
    // Essa função retorna outro middleware.
    // Os perfis permitidos são passados assim:
    // permitirPerfis("admin", "lider")
    return (req, res, next) => {
        // Se req.usuario não existir, significa que autenticarToken
        // não foi executado antes ou falhou.
        if (!req.usuario) {
            return res.status(401).json({
                erro: "Usuário não autenticado."
            });
        }

        // Verifica se o perfil do usuário está na lista permitida.
        if (!perfisPermitidos.includes(req.usuario.perfil)) {
            return res.status(403).json({
                erro: "Você não tem permissão para acessar esta função."
            });
        }

        // Se passou por todas as verificações, libera a rota.
        next();
    };
}

module.exports = {
    autenticarToken,
    permitirPerfis
};
