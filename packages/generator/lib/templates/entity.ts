import type { Column, Table } from '@nestjs-modules/inverse-introspector';
import type { GeneratedFile } from '../generate-project';
import { fieldType, NEST_SCALARS } from '../graphql-types';
import { camelCase, kebabCase, pascalCase } from '../naming';

export interface EntityNames {
  className: string;
  fileName: string;
}

export const entityNames = (table: Table): EntityNames => ({
  className: pascalCase(table.name),
  fileName: kebabCase(table.name),
});

/** Model, create input, service, resolver and module of one table. */
export function entityFiles(table: Table): GeneratedFile[] {
  const { className, fileName } = entityNames(table);
  const dir = `src/${fileName}`;
  return [
    {
      path: `${dir}/${fileName}.model.ts`,
      content: modelFile(className, table.columns),
    },
    {
      path: `${dir}/create-${fileName}.input.ts`,
      content: inputFile(className, table.columns),
    },
    {
      path: `${dir}/${fileName}.service.ts`,
      content: serviceFile(table, className, fileName),
    },
    {
      path: `${dir}/${fileName}.resolver.ts`,
      content: resolverFile(className, fileName),
    },
    {
      path: `${dir}/${fileName}.module.ts`,
      content: moduleFile(className, fileName),
    },
  ];
}

const propertyKey = (name: string) =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`;

function graphqlImports(decorator: string, columns: Column[]): string {
  const scalars = new Set(
    columns
      .map((column) => fieldType(column.kind).graphql)
      .filter((type) => NEST_SCALARS.includes(type)),
  );
  return `import { Field, ${[...scalars, decorator].sort().join(', ')} } from '@nestjs/graphql';`;
}

function field(column: Column, optional: boolean): string {
  const { graphql, ts } = fieldType(column.kind);
  const options = optional ? ', { nullable: true }' : '';
  const type = column.nullable ? `${ts} | null` : ts;
  return `  @Field(() => ${graphql}${options})\n  ${camelCase(column.name)}${optional ? '?' : ''}: ${type};`;
}

function modelFile(className: string, columns: Column[]): string {
  return `${graphqlImports('ObjectType', columns)}

@ObjectType()
export class ${className} {
${columns.map((column) => field(column, column.nullable)).join('\n\n')}
}
`;
}

// Columns with a default may be left out so the database fills them in.
function inputFile(className: string, columns: Column[]): string {
  return `${graphqlImports('InputType', columns)}

@InputType()
export class Create${className}Input {
${columns.map((column) => field(column, column.nullable || column.hasDefault)).join('\n\n')}
}
`;
}

function serviceFile(
  table: Table,
  className: string,
  fileName: string,
): string {
  const quoted = `"${table.schema}"."${table.name}"`;
  const values = table.columns.map(
    (column) =>
      `      ${propertyKey(column.name)}: input.${camelCase(column.name)},`,
  );
  const fields = table.columns.map(
    (column) => `  ${camelCase(column.name)}: '${column.name}',`,
  );
  return `import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Create${className}Input } from './create-${fileName}.input';
import { ${className} } from './${fileName}.model';

const TABLE = '${quoted}';

/** Model field → column. */
const FIELDS = {
${fields.join('\n')}
};

@Injectable()
export class ${className}Service {
  constructor(private readonly db: DatabaseService) {}

  create(input: Create${className}Input): Promise<${className}> {
    const values = {
${values.join('\n')}
    };
    return this.db.insert<${className}>(TABLE, values, FIELDS);
  }
}
`;
}

function resolverFile(className: string, fileName: string): string {
  const service = `${camelCase(className)}Service`;
  return `import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Create${className}Input } from './create-${fileName}.input';
import { ${className} } from './${fileName}.model';
import { ${className}Service } from './${fileName}.service';

@Resolver(() => ${className})
export class ${className}Resolver {
  constructor(private readonly ${service}: ${className}Service) {}

  @Mutation(() => ${className})
  create${className}(@Args('input') input: Create${className}Input): Promise<${className}> {
    return this.${service}.create(input);
  }
}
`;
}

function moduleFile(className: string, fileName: string): string {
  return `import { Module } from '@nestjs/common';
import { ${className}Resolver } from './${fileName}.resolver';
import { ${className}Service } from './${fileName}.service';

@Module({
  providers: [${className}Resolver, ${className}Service],
})
export class ${className}Module {}
`;
}
