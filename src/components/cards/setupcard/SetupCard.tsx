import React from "react";
import { useTranslation } from "react-i18next";
import Button from "../../button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { Card } from "react-bootstrap";

type SetupCardProps = {
    disabled?: boolean;
    onClick: () => void;
};

export const SetupCard = ({ onClick, disabled = false }: SetupCardProps) => {
    const { t } = useTranslation();

    return (
        <Card className="select-card">
            <Card.Body>
                <div className="select-icon">
                    <FontAwesomeIcon
                        icon={faWandMagicSparkles as IconDefinition}
                        size="4x"
                    />
                </div>
                <p>{t("card.setup.description")}</p>
            </Card.Body>

            <Card.Footer>
                <Button onClick={onClick} disabled={disabled}>
                    <>{t("card.setup.button")}</>
                </Button>
            </Card.Footer>
        </Card>
    );
};
