import { PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/** Per-route body validation: @Body(new ZodPipe(SomeSchema)) */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value); // ZodError → AppExceptionFilter → 400
  }
}
