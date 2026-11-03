exports.up = async (knex) => {
  await knex.schema.createTable("packages", (t) => {
    t.increments("id").primary();
    t.string("key").notNullable().unique();
    t.string("storage_name").notNullable();
    t.string("name").notNullable();
    t.string("version").nullable();
    t.text("description").nullable();
    t.string("type").notNullable();
    t.string("header_path").notNullable();
    t.string("removed_deps").notNullable().defaultTo("");
    t.integer("file_count").notNullable();
    t.integer("size_bytes").notNullable();
    t.integer("zip_bytes").notNullable();
    t.bigInteger("expires_at").nullable();
    t.timestamps(true, true);

    t.index("expires_at");
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("packages");
};
