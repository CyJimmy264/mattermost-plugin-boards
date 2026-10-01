// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useEffect, useRef} from 'react'
import {FormattedMessage, IntlShape} from 'react-intl'
import {useDrop, useDrag} from 'react-dnd'

import {Constants, Permission} from '../../constants'
import {IPropertyOption, IPropertyTemplate, Board, BoardGroup} from '../../blocks/board'
import {BoardView} from '../../blocks/boardView'
import {Card} from '../../blocks/card'
import mutator from '../../mutator'
import Button from '../../widgets/buttons/button'
import IconButton from '../../widgets/buttons/iconButton'
import AddIcon from '../../widgets/icons/add'
import DeleteIcon from '../../widgets/icons/delete'
import HideIcon from '../../widgets/icons/hide'
import OptionsIcon from '../../widgets/icons/options'
import Menu from '../../widgets/menu'
import MenuWrapper from '../../widgets/menuWrapper'
import Editable from '../../widgets/editable'
import Label from '../../widgets/label'
import CompassIcon from '../../widgets/icons/compassIcon'
import {useHasCurrentBoardPermissions} from '../../hooks/permissions'

import BoardPermissionGate from '../permissions/boardPermissionGate'

import {KanbanCalculation} from './calculation/calculation'

type Props = {
    board: Board
    activeView: BoardView
    group: BoardGroup
    groupByProperty?: IPropertyTemplate
    intl: IntlShape
    readonly: boolean
    addCard: (groupByOptionId?: string, show?: boolean) => Promise<void>
    propertyNameChanged: (option: IPropertyOption, text: string) => Promise<void>
    onDropToColumn: (srcOption: IPropertyOption, card?: Card, dstOption?: IPropertyOption) => void
    collapsed?: boolean
    onToggleCollapsed?: (columnId: string) => void
    calculationMenuOpen: boolean
    onCalculationMenuOpen: () => void
    onCalculationMenuClose: () => void
}

const defaultCalculation = 'count'
const defaultProperty: IPropertyTemplate = {
    id: Constants.titleColumnId,
} as IPropertyTemplate

export default function KanbanColumnHeader(props: Props): JSX.Element {
    const {board, activeView, intl, group, groupByProperty} = props
    const collapsed = Boolean(props.collapsed && group.option.id)
    const [groupTitle, setGroupTitle] = useState(group.option.value)
    const canEditBoardProperties = useHasCurrentBoardPermissions([Permission.ManageBoardProperties])
    const canEditOption = groupByProperty?.type !== 'person' && group.option.id

    const headerRef = useRef<HTMLDivElement>(null)

    const [{isDragging}, drag] = useDrag(() => ({
        type: 'column',
        item: group.option,
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }))
    const [{isOver}, drop] = useDrop(() => ({
        accept: 'column',
        collect: (monitor) => ({
            isOver: monitor.isOver(),
        }),
        drop: (item: IPropertyOption) => {
            props.onDropToColumn(item, undefined, group.option)
        },
    }), [props.onDropToColumn])

    useEffect(() => {
        setGroupTitle(group.option.value)
    }, [group.option.value])

    if (canEditBoardProperties) {
        drop(drag(headerRef))
    }

    let className = 'octo-board-header-cell KanbanColumnHeader'
    if (isOver) {
        className += ' dragover'
    }
    if (collapsed) {
        className += ' collapsed'
    }

    const groupCalculation = props.activeView.fields.kanbanCalculations[props.group.option.id]
    const calculationValue = groupCalculation ? groupCalculation.calculation : defaultCalculation
    const calculationProperty = groupCalculation ? props.board.cardProperties.find((property) => property.id === groupCalculation.propertyId) || defaultProperty : defaultProperty
    const collapseButton = group.option.id ? (
        <IconButton
            className={`KanbanColumnHeader-collapse ${props.readonly ? 'readonly' : ''}`}
            title={intl.formatMessage({
                id: collapsed ? 'BoardComponent.expand-column' : 'BoardComponent.collapse-column',
                defaultMessage: collapsed ? 'Expand column' : 'Collapse column',
            })}
            icon={<CompassIcon icon='menu-right'/>}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
                if (!props.readonly) {
                    props.onToggleCollapsed?.(group.option.id)
                }
            }}
        />
    ) : null
    const groupTitleContent = [
        !group.option.id && (
            <Label
                key='empty'
                title={intl.formatMessage({
                    id: 'BoardComponent.no-property-title',
                    defaultMessage: 'Items with an empty {property} property will go here. This column cannot be removed.',
                }, {property: groupByProperty!.name})}
            >
                <FormattedMessage
                    id='BoardComponent.no-property'
                    defaultMessage='No {property}'
                    values={{
                        property: groupByProperty!.name,
                    }}
                />
            </Label>
        ),
        groupByProperty?.type === 'person' && (
            <Label key='person'>
                {groupTitle}
            </Label>
        ),
        canEditOption && collapsed && (
            <Label key='collapsed' color={group.option.color}>
                {groupTitle}
            </Label>
        ),
        canEditOption && !collapsed && (
            <Label key='editable' color={group.option.color}>
                <Editable
                    value={groupTitle}
                    placeholderText='New Select'
                    onChange={setGroupTitle}
                    onSave={() => {
                        if (groupTitle.trim() === '') {
                            setGroupTitle(group.option.value)
                        }
                        props.propertyNameChanged(group.option, groupTitle)
                    }}
                    onCancel={() => {
                        setGroupTitle(group.option.value)
                    }}
                    readonly={props.readonly || !canEditBoardProperties}
                    spellCheck={true}
                />
            </Label>
        ),
    ].filter(Boolean)
    return (
        <div
            key={group.option.id || 'empty'}
            ref={headerRef}
            style={{opacity: isDragging ? 0.5 : 1}}
            className={className}
            draggable={!props.readonly && canEditBoardProperties}
        >
            {collapseButton}<div className='KanbanColumnHeader-title'>{groupTitleContent}</div>{!collapsed &&
                <Button
                    className='KanbanColumnHeader-count'
                    title={intl.formatMessage({
                        id: 'BoardComponent.card-count',
                        defaultMessage: 'Card count',
                    })}
                >
                    {`${group.cards.length}`}
                </Button>
            }{!collapsed &&
                <KanbanCalculation
                    cards={group.cards}
                    menuOpen={props.calculationMenuOpen}
                    value={calculationValue}
                    property={calculationProperty}
                    onMenuClose={props.onCalculationMenuClose}
                    onMenuOpen={props.onCalculationMenuOpen}
                    cardProperties={board.cardProperties}
                    readonly={props.readonly || !canEditBoardProperties}
                    onChange={(data: {calculation: string, propertyId: string}) => {
                        if (data.calculation === calculationValue && data.propertyId === calculationProperty.id) {
                            return
                        }

                        const newCalculations = {
                            ...props.activeView.fields.kanbanCalculations,
                        }
                        newCalculations[props.group.option.id] = {
                            calculation: data.calculation,
                            propertyId: data.propertyId,
                        }

                        mutator.changeViewKanbanCalculations(board.id, props.activeView.id, props.activeView.fields.kanbanCalculations, newCalculations)
                    }}
                />}
            {!collapsed && <div className='octo-spacer'/>}
            {collapsed && <Button className='KanbanColumnHeader-count'>{`${group.cards.length}`}</Button>}
            {!props.readonly && !collapsed &&
                <>
                    <BoardPermissionGate permissions={[Permission.ManageBoardProperties]}>
                        <MenuWrapper>
                            <IconButton icon={<OptionsIcon/>}/>
                            <Menu>
                                <Menu.Text
                                    id='hide'
                                    icon={<HideIcon/>}
                                    name={intl.formatMessage({id: 'BoardComponent.hide', defaultMessage: 'Hide'})}
                                    onClick={() => mutator.hideViewColumn(board.id, activeView, group.option.id || '')}
                                />
                                {canEditOption &&
                                    <>
                                        <Menu.Text
                                            id='delete'
                                            icon={<DeleteIcon/>}
                                            name={intl.formatMessage({id: 'BoardComponent.delete', defaultMessage: 'Delete'})}
                                            onClick={() => mutator.deletePropertyOption(board.id, board.cardProperties, groupByProperty!, group.option)}
                                        />
                                        <Menu.Separator/>
                                        {Object.entries(Constants.menuColors).map(([key, color]) => (
                                            <Menu.Color
                                                key={key}
                                                id={key}
                                                name={color}
                                                onClick={() => mutator.changePropertyOptionColor(board.id, board.cardProperties, groupByProperty!, group.option, key)}
                                            />
                                        ))}
                                    </>}
                            </Menu>
                        </MenuWrapper>
                    </BoardPermissionGate>
                    <BoardPermissionGate permissions={[Permission.ManageBoardCards]}>
                        <IconButton
                            icon={<AddIcon/>}
                            onClick={() => {
                                props.addCard(group.option.id, true)
                            }}
                        />
                    </BoardPermissionGate>
                </>
            }
        </div>
    )
}
