// database.factory.ts
import { DatabaseIntrospector } from './bd_model';
import { PostgresStrategy } from './model-service';

export class DatabaseFactory {
  static create(uri: string): DatabaseIntrospector {
    try {
      const parsedUri = new URL(uri);
      const protocol = parsedUri.protocol.replace(':', '').toLowerCase();

      // TODO: Pasar a un arreglo
      switch (protocol) {
        case 'postgres':
        case 'postgresql':
          return new PostgresStrategy(uri);

        // Espacio para futuros motores:
        // case 'mysql':
        //   return new MysqlStrategy(uri);

        default:
          throw new Error(`Motor de base de datos no soportado: '${protocol}'`);
      }
    } catch (error) {
      throw new Error(`URI de base de datos inválida: ${(error as Error).message}`);
    }
  }
}