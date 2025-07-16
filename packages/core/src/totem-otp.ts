import type { IOTPTarget, IOTPValue, ITotemOTP, ITotemOTPConfiguration } from './interfaces'

export class TotemOTP implements ITotemOTP {
  public constructor(public readonly configuration: ITotemOTPConfiguration) {}

  public async request(target: IOTPTarget, parentReference: string): Promise<IOTPValue> {
    throw new Error('Method not implemented.')
  }

  public async validate(reference: string, otpValue: string): Promise<number> {
    throw new Error('Method not implemented.')
  }
}
