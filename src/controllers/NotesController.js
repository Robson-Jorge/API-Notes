const knex = require("../database/knex")

class NotesController {

  async create(req, res) {
    const { title, description, tags, links } = req.body
    const user_id = req.user.id

    const [ {note_id} ] = await knex("notes").returning({ note_id: 'id' }).insert({
      title,
      description,
      user_id
    })

    const linksInsert = links.map(link => {
      return {
        note_id,
        url: link
      }
    })

    await knex("links").insert(linksInsert)

    const tagsInsert = tags.map(name => {
      const normalizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()

      return {
        note_id,
        name: normalizedName,
        user_id
      }
    })

    await knex("tags").insert(tagsInsert)

    return res.json()
  }

  async show(req, res) {
    const { id } = req.params

    const note = await knex("notes").where({ id }).first()
    const tags = await knex("tags").where({ note_id: id }).orderBy("name")
    const links = await knex("links").where({ note_id: id }).orderBy("created_at")

    return res.json({ ...note, tags, links })
  }

  async delete(req, res) {
    const { id } = req.params

    await knex("notes").where({ id }).delete()

    return res.json()
  }

  async index(req, res) {
    const { title, tags } = req.query
    const user_id = req.user.id

    let notes

    if (tags) {
      const filterTags = tags.split(",").map(tag => tag.trim())

      notes = await knex("tags")
      .select([
        "notes.id",
        "notes.title",
        "notes.user_id"
      ])
      .where("notes.user_id", user_id)
      .where(function() {
        this.whereRaw("LOWER(notes.title) LIKE ?", `%${title.toLowerCase()}%`)
      })
      .whereIn("name", filterTags)
      .innerJoin("notes", "notes.id", "tags.note_id")
      .groupBy("notes.id")
      .orderBy("notes.title")

    } else {
      notes = await knex("notes")
      .where({ user_id })
      .where(function() {
        this.whereRaw("LOWER(notes.title) LIKE ?", `%${title.toLowerCase()}%`)
      })
      .orderBy("title")
    }

    const userTags = await knex("tags").where({ user_id })
    const notesWithTags = notes.map(note => {
      const noteTags = userTags.filter(tag => tag.note_id === note.id)

      return {
        ...note,
        tags: noteTags
      }
    })
    
    return res.json(notesWithTags)
  }
 
  async update(req, res) {
    const { id } = req.params
    let { title, description, links, tags } = req.body

    const database = await knex("notes").where({ id }).first()
    
    if (!database) {
      throw new AppError("Nota não encontrada")
    }
    
    const user_id = req.user.id

    if (database.user_id !== user_id) {
      throw new AppError("Não autorizado")
    }

    title = title ?? database.title;
    description = description ?? database.description;

    await knex.transaction(async (trx) => {
      await knex("notes")
        .where({ id })
        .update({
          title,
          description,
        })
        .transacting(trx);

      if (links) {
        await knex("links").where({ note_id: id }).del().transacting(trx);
        const linksInsert = links.map(link => ({
          note_id: id,
          url: link
        }));
        await knex("links").insert(linksInsert).transacting(trx);
      }

      if (tags) {
        await knex("tags").where({ note_id: id }).del().transacting(trx);
        const tagsInsert = tags.map(name => ({
          note_id: id,
          name: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(),
          user_id
        }));
        await knex("tags").insert(tagsInsert).transacting(trx);
      }
    });

    return res.json()
  }
}

module.exports = NotesController