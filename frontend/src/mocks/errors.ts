import { ApiError } from '../api/types'

export function mockError(status: number, detail: string): never {
  throw new ApiError(status, { detail })
}
