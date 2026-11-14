// HoopStreet Level 1 (P2-18): every player's portfolio as a Solana account.
//
// Paste this file into Solana Playground (https://beta.solpg.io) as src/lib.rs
// in a new Anchor project, then Build and Deploy on devnet. Playground fills in
// declare_id! when you build. Copy the program id it shows into the backend's
// SOLANA_PORTFOLIO_PROGRAM_ID (see backend/trading/chain/program/README.md).
//
// - One Portfolio account per player, at the address derived from
//   ["portfolio", backend authority, player wallet].
// - Only the backend's fee-payer key (the authority) can create or update it.
//   It signs and pays; players never need SOL or a wallet app.
// - Every update carries a sequence number that must go up, so an old update
//   that lands late can never overwrite a newer one.
// - The layout is fixed-size (no Vec), so the backend can decode it byte for
//   byte: 366 bytes including Anchor's 8-byte discriminator.

use anchor_lang::prelude::*;

// Deployed on devnet from Solana Playground (14 Nov 2026).
declare_id!("9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp");

pub const MAX_HOLDINGS: usize = 16;
pub const SYMBOL_LEN: usize = 8;

#[program]
pub mod hoopstreet_portfolio {
    use super::*;

    /// Open a player's portfolio account (the backend pays the rent).
    pub fn create_portfolio(ctx: Context<CreatePortfolio>) -> Result<()> {
        let portfolio = &mut ctx.accounts.portfolio;
        portfolio.authority = ctx.accounts.authority.key();
        portfolio.owner = ctx.accounts.owner.key();
        portfolio.bump = ctx.bumps.portfolio;
        Ok(())
    }

    /// Replace the stored state with the player's latest cash and holdings.
    pub fn update_portfolio(ctx: Context<UpdatePortfolio>, update: PortfolioUpdate) -> Result<()> {
        require!(update.holding_count as usize <= MAX_HOLDINGS, PortfolioError::TooManyHoldings);
        let portfolio = &mut ctx.accounts.portfolio;
        require!(update.seq > portfolio.seq, PortfolioError::StaleUpdate);
        portfolio.cash_cents = update.cash_cents;
        portfolio.equity_cents = update.equity_cents;
        portfolio.trade_count = update.trade_count;
        portfolio.updated_t = update.updated_t;
        portfolio.seq = update.seq;
        portfolio.holding_count = update.holding_count;
        portfolio.holdings = update.holdings;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct Holding {
    pub symbol: [u8; SYMBOL_LEN], // ticker, e.g. "SGA", zero-padded
    pub qty: i64,                 // shares; negative = short
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PortfolioUpdate {
    pub cash_cents: i64,          // HOOP x 100; negative = borrowed on margin
    pub equity_cents: i64,        // cash + holdings at the last price, when this was sent
    pub trade_count: u32,         // orders that traded
    pub updated_t: i64,           // market time, epoch seconds
    pub seq: u64,                 // must be higher than the stored one
    pub holding_count: u8,        // how many entries of `holdings` are used
    pub holdings: [Holding; MAX_HOLDINGS],
}

#[account]
pub struct Portfolio {
    pub authority: Pubkey,        // the backend key allowed to update it
    pub owner: Pubkey,            // the player's wallet
    pub cash_cents: i64,
    pub equity_cents: i64,
    pub trade_count: u32,
    pub updated_t: i64,
    pub seq: u64,
    pub holding_count: u8,
    pub holdings: [Holding; MAX_HOLDINGS],
    pub bump: u8,
}

impl Portfolio {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 4 + 8 + 8 + 1 + MAX_HOLDINGS * (SYMBOL_LEN + 8) + 1;
}

#[derive(Accounts)]
pub struct CreatePortfolio<'info> {
    #[account(
        init,
        payer = authority,
        space = Portfolio::SPACE,
        seeds = [b"portfolio", authority.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub portfolio: Account<'info, Portfolio>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: the player's wallet address. Only used as a seed and stored; it never signs or pays.
    pub owner: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePortfolio<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"portfolio", authority.key().as_ref(), portfolio.owner.as_ref()],
        bump = portfolio.bump
    )]
    pub portfolio: Account<'info, Portfolio>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum PortfolioError {
    #[msg("This update is older than the one already stored")]
    StaleUpdate,
    #[msg("A portfolio holds at most 16 players")]
    TooManyHoldings,
}
