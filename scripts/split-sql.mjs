/**
 * Divide un script SQL en sentencias, respetando:
 *   · cadenas 'texto' (con '' escapado)
 *   · bloques $$ … $$ / $tag$ … $tag$ de PL/pgSQL
 *   · comentarios de línea --
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollarTag = null;

  while (i < sql.length) {
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += sql[i++];
      continue;
    }
    if (inSingle) {
      buf += sql[i];
      if (sql[i] === "'") {
        if (sql[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) {
        buf += sql.slice(i);
        break;
      }
      buf += sql.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }
    if (sql[i] === "'") {
      inSingle = true;
      buf += "'";
      i++;
      continue;
    }
    if (sql[i] === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (sql[i] === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      i++;
      continue;
    }
    buf += sql[i++];
  }

  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}
