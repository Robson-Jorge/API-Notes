const { hash, compare } = require("bcryptjs")
const AppError = require("../utils/AppError")
const knex = require("../database/knex")
const supabase = require("../configs/supabaseConfig")

class UsersController {
  async create(req, res) {
    const { name, email, password } = req.body

    const checkUserExists = await knex("users").where({ email }).first()
    if (checkUserExists) {
      throw new AppError("Este e-mail já existe!")
    }

    const hashedPassword = await hash(password, 8)
    await knex("users").insert({
      name,
      email,
      password: hashedPassword,
    })

    return res.status(201).json()
  }

  async update(req, res) {
    const { name, email, password, old_password } = req.body
    const user_id = req.user.id

    const user = await knex("users").where({ id: user_id }).first()

    if (!user) {
      throw new AppError("Usuário não encontrado")
    }

    const userWithUpdatedEmail = email ? await knex("users").where({ email }).first() : null

    if (userWithUpdatedEmail && userWithUpdatedEmail.id !== user.id) {
      throw new AppError("Este e-mail já está em uso!")
    }

    user.name = name ?? user.name
    user.email = email ?? user.email

    if (password && !old_password) {
      throw new AppError("Você precisa informar a senha antiga para definir a nova senha")
    }

    if (password && old_password) {
      const checkOldPassword = await compare(old_password, user.password)

      if (!checkOldPassword) {
        throw new AppError("A senha antiga não confere")
      }

      user.password = await hash(password, 8)
    }

    await knex("users").where("id", user_id).update({
      name: user.name,
      email: user.email,
      password: user.password,
    })

    return res.json()
  }

  async delete(req, res) {
    const user_id = req.user.id

    const user = await knex("users").where({ id: user_id }).first()

    if (user.avatar !== null) {
      const urlParts = user.avatar.split('/') 
      const avatarName = urlParts[urlParts.length - 1]
      await supabase.storage.from("Upload-avatar").remove([
        avatarName,
      ])
    }

    await knex("users").where({ id: user.id }).delete()

    return res.json({
      message: "Usuário deletado com sucesso!",
    })
  }
}

module.exports = UsersController
