import type { AccountingAction } from './accounting'
import type { BootstrapInviteConsumeResult } from './db'

export function buildBootstrapReplyActions(result: BootstrapInviteConsumeResult): AccountingAction[] {
  switch (result.status) {
    case 'created':
      return [
        {
          type: 'reply-text',
          text: '✅ 已建立你的私人帳本！\n現在可以直接輸入「午餐 120」開始記帳。\n之後如果想綁定其他通訊軟體，再使用配對功能即可。'
        }
      ]
    case 'identity-already-linked':
      return [
        {
          type: 'reply-text',
          text: 'ℹ️ 你已經建立過帳本了，可以直接開始記帳。'
        }
      ]
    case 'expired':
      return [
        {
          type: 'reply-text',
          text: '⌛ 邀請碼已過期，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'used':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼已被使用，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'revoked':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼已失效，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'account-slug-conflict':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼目前無法使用，請聯繫管理者重新建立。'
        }
      ]
    case 'invalid':
    default:
      return [
        {
          type: 'reply-text',
          text: '❌ 邀請碼無效，請向管理者確認或索取新的建立帳本邀請碼。'
        }
      ]
  }
}
