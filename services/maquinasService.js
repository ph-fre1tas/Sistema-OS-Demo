class ErroMaquinas extends Error {}

function validarCadastro(entrada = {}) {
    const { codigo, nome, setor = "", marca = "", modelo = "", observacoes = "", foto = "" } = entrada || {};
    const campos = [
        [codigo, "ID da máquina", 60, true],
        [nome, "Nome", 160, true],
        [setor, "Setor", 120, false],
        [marca, "Marca", 100, false],
        [modelo, "Modelo", 100, false],
        [observacoes, "Observações", 4000, false],
        [foto, "Nome do arquivo da foto", 255, false]
    ];
    for (const [valor, rotulo, limite, obrigatorio] of campos) {
        if (typeof valor !== "string" || (obrigatorio && !valor.trim()) || valor.trim().length > limite) {
            throw new ErroMaquinas(obrigatorio
                ? `${rotulo} é obrigatório e deve ter até ${limite} caracteres.`
                : `${rotulo} deve ter até ${limite} caracteres.`);
        }
    }

    const fotoLimpa = foto.trim();
    if (fotoLimpa && (!/^[\p{L}\p{N}._ -]+\.(?:jpe?g|png|webp|gif)$/iu.test(fotoLimpa) || fotoLimpa.includes(".."))) {
        throw new ErroMaquinas("Informe somente o nome de um arquivo de imagem JPG, PNG, WEBP ou GIF.");
    }

    return [codigo.trim(), nome.trim(), setor.trim(), marca.trim(), modelo.trim(), observacoes.trim(), fotoLimpa || null];
}

module.exports = { ErroMaquinas, validarCadastro };
