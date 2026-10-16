import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { InverseModelOptions } from '../inverse-model.interfaces';

/** forRoot and forRootAsync of the module that reads the options and opens the connection. */
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: INVERSE_MODEL_OPTIONS,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<InverseModelOptions>({
  moduleName: 'InverseModel',
})
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createInverseModelOptions')
  .build();

/** Options of `InverseModelModule.forRootAsync`: `imports`, `inject` and `useFactory`, or `useClass` or `useExisting`. */
export type InverseModelAsyncOptions = typeof ASYNC_OPTIONS_TYPE;
