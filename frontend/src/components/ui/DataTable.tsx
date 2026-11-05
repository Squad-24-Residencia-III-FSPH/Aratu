import type { ReactNode } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

/** Definição de coluna da tabela reutilizável. */
export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
}

export interface DataTableProps<T> {
  caption: string
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  renderActions?: (row: T) => ReactNode
  busy?: boolean
  minWidth?: number | string
  tableLayout?: 'auto' | 'fixed'
  actionsWidth?: number | string
  loadingContent?: ReactNode
  emptyContent?: ReactNode
  stateCellSx?: SxProps<Theme>
  containerClassName?: string
  paperSx?: SxProps<Theme>
  headerCellSx?: SxProps<Theme>
  cellSx?: SxProps<Theme>
}

/** Tabela acessível com cabeçalho semântico, legenda e rolagem focável. */
export default function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  renderActions,
  busy,
  minWidth = 960,
  tableLayout = 'auto',
  actionsWidth,
  loadingContent,
  emptyContent,
  stateCellSx,
  containerClassName,
  paperSx,
  headerCellSx,
  cellSx,
}: DataTableProps<T>) {
  const columnCount = columns.length + (renderActions ? 1 : 0)

  return (
    <Paper
      variant="outlined"
      sx={paperSx ?? { borderRadius: 2, overflow: 'hidden' }}
    >
      <TableContainer
        className={containerClassName}
        role="region"
        aria-label={`${caption}. Use a rolagem horizontal para percorrer as colunas.`}
        aria-busy={busy ? 'true' : undefined}
        tabIndex={0}
        sx={{
          overflowX: 'auto',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '-2px',
          },
        }}
      >
        <Table aria-label={caption} sx={{ minWidth, tableLayout }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  component="th"
                  scope="col"
                  align={column.align ?? 'left'}
                  sx={[
                    {
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      ...(column.width !== undefined ? { width: column.width } : {}),
                    },
                    ...(Array.isArray(headerCellSx)
                      ? headerCellSx
                      : headerCellSx ? [headerCellSx] : []),
                  ]}
                >
                  {column.header}
                </TableCell>
              ))}
              {renderActions && (
                <TableCell
                  component="th"
                  scope="col"
                  align="right"
                  sx={[
                    { fontWeight: 700, ...(actionsWidth !== undefined ? { width: actionsWidth } : {}) },
                    ...(Array.isArray(headerCellSx)
                      ? headerCellSx
                      : headerCellSx ? [headerCellSx] : []),
                  ]}
                >
                  Ações
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {busy && loadingContent !== undefined ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={stateCellSx ?? { py: 0 }}>
                  {loadingContent}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={stateCellSx ?? { py: 4 }}>
                  {emptyContent ?? 'Nenhum veículo para exibir.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row)} hover>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.align ?? 'left'}
                      sx={[
                        column.width !== undefined ? { width: column.width } : {},
                        ...(Array.isArray(cellSx) ? cellSx : cellSx ? [cellSx] : []),
                      ]}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                  {renderActions && (
                    <TableCell
                      align="right"
                      sx={{ whiteSpace: 'nowrap', ...(actionsWidth !== undefined ? { width: actionsWidth } : {}) }}
                    >
                      {renderActions(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
